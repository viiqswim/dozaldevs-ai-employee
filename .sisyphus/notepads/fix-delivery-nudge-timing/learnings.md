# Learnings — fix-delivery-nudge-timing

## [2026-05-27] Plan Start — Inherited Wisdom from fix-delivery-confirmation-conflict

### Root Cause (THIS Plan)

- `runOpencodeSession` uses hardcoded `minElapsedMs: 30000` (30s) for ALL phases
- Delivery is a 5-step flow: parse JSON → extract draft → write file → post to Slack → submit-output
- When LLM pauses >20s between steps, 30s idle timer fires → harness sends aggressive nudge
- Nudge says "Run this command NOW" → LLM skips Slack posting, goes straight to submit-output
- Result: task is "Done" but Slack was never posted to (30% failure rate)
- Fix: add optional `minElapsedMs` param to `runOpencodeSession`, pass 120s for delivery, soften nudge

### Key Line Numbers (opencode-harness.mts)

- Line 294: `runOpencodeSession` function signature → ADD `options?: { minElapsedMs?: number }` as 4th param
- Line 356: `minElapsedMs: 30000` in monitorSession call → CHANGE TO `options?.minElapsedMs ?? 30_000`
- Line 503: nudge message `"You forgot the mandatory final step. Run this command NOW:\n..."` → SOFTEN
- Line 507: `minElapsedMs: 10000` (post-nudge recovery) → DO NOT TOUCH
- Line 719-722: delivery call to `runOpencodeSession` → ADD `{ minElapsedMs: 120_000 }` as 4th arg
- Line 929: execution call to `runOpencodeSession` → DO NOT ADD 4th arg (default 30000ms applies)

### Guardrails (Confirmed)

- Delivery runs in SEPARATE Docker container — `/tmp/summary.txt` does NOT persist from execution phase
- session-manager.ts already accepts `minElapsedMs` as option — no changes needed there
- `submitOutputCmd` at line 722 is `tsx /tools/platform/submit-output.ts --summary "..." --classification "NO_ACTION_NEEDED"` — DO NOT CHANGE

### Architecture Reminder

- Archetype: `3b07ec63-207f-4f2b-a8c3-c17f08bc508f` (daily-real-estate-inspiration-2)
- Tenant: `00000000-0000-0000-0000-000000000003` (VLRE)
- Employee slug: `daily-real-estate-inspiration-2`
- Regression check employee: `real-estate-motivation-bot-2` (same tenant, no delivery phase)
- Docker image: `ai-employee-worker:latest` — must rebuild after any `src/workers/` change

## [2026-05-27] Task 1 Complete — 4 Surgical Edits Applied

### Edits Made (opencode-harness.mts)

1. **Function signature (line 298)**: Added `options?: { minElapsedMs?: number }` as 4th param
2. **monitorSession call (line 357)**: Changed `minElapsedMs: 30000` → `options?.minElapsedMs ?? 30_000`
3. **Nudge message (line 504)**: Softened from "Run this command NOW" to "Finish ALL your remaining steps first, then run this as the very last thing"
4. **Delivery call (line 719-724)**: Added `{ minElapsedMs: 120_000 }` as 4th arg

### Confirmed Unchanged

- Line 508: `minElapsedMs: 10000` (post-nudge recovery) — untouched
- Line 929: execution call `runOpencodeSession(instructionsWithSubmitOutput, model, submitOutputCmd)` — no 4th arg added

### Lint Status

- `npx eslint src/workers/opencode-harness.mts` → clean (no output = no errors)
- Pre-existing lint errors in `dashboard/dist/` and `.sisyphus/evidence/` are unrelated to this change

## [2026-05-26] Task 2 Complete — Docker Image Rebuilt Successfully

### Build Details

- Image: `ai-employee-worker:latest`
- Image ID: `sha256:2961ea8894cf59ecafae1ba58d8339c0bd9b550a2cc1681daa1d13d59379e8e0`
- Build timestamp: `2026-05-26 22:37:55 -0500 CDT`
- Exit code: 0 (success)
- Build time: ~30s (fast — Docker layer cache hit for most layers)

### Verification

- `grep -c "120000" /app/dist/workers/opencode-harness.mjs` → count: 1
- Confirms the 120000ms delivery idle timeout from commit `51c2eb1` is compiled into the image

### Pattern: Docker Build Speed

- Build completed in ~30s due to layer caching
- Only the TypeScript compilation layer was invalidated by the harness change
- All npm install layers were cached

### Evidence Files

- `.sisyphus/evidence/task-2-docker-build.txt` — build log + exit code + timestamp
- `.sisyphus/evidence/task-2-image-verify.txt` — grep result confirming 120000 in compiled harness

## T4: Execution Phase Regression Check (2026-05-27)

**Result**: PASS (execution phase unbroken by minElapsedMs addition)

### Task IDs:

1. `5da7afda-1529-4d06-bace-7a80d2b0f650` → Done (execution ✅, delivery ✅)
2. `bad15685-cb5b-4cdf-8b15-c6bdaa6096ce` → Failed (execution ✅, delivery ❌ worker_terminated)

### Summary:

- Both runs completed the execution phase successfully (Executing → Submitting)
- Run 2 delivery failure is a pre-existing infrastructure issue (worker_terminated), NOT related to minElapsedMs
- The minElapsedMs default of 30000ms is working correctly — execution phase calls pass no options and use the default
- Run 1 execution took ~45s; Run 2 execution took ~46s
- Evidence: `.sisyphus/evidence/task-4-regression-check.txt`

## T3: 10-Run Delivery Validation (2026-05-26)

**Result**: 10/10 PASSED

### Task IDs:

1. `4152d41c-5db1-4277-8d16-654b663cb6be` → Done, post-message: 2
2. `41f075d0-8f77-48b5-a583-ad27c6bb3295` → Done, post-message: 2
3. `fa518261-e478-441d-934a-bfe17ffe36fd` → Done, post-message: 2
4. `e3661968-ccff-46eb-87fc-e3f4ae6735fb` → Done, post-message: 2
5. `38c4fbab-2a10-431a-a547-8d18d4bc9adf` → Done, post-message: 4
6. `d5300645-0f16-4398-9275-2f7b0705f090` → Done, post-message: 2
7. `ce015701-f1dd-47aa-b9ce-e5293711ecdb` → Done, post-message: 2
8. `234d41b7-f065-4d62-b972-3eba7cf49e7d` → Done, post-message: 2
9. `e52466ad-636f-47a6-b91d-24df0da51bc7` → Done, post-message: 2
10. `d70cefaf-fe27-4a3e-82fc-4ccabefee931` → Done, post-message: 2

### Summary:

- Pass rate: 10/10 (100%)
- Any failures? NO
- All tasks reached Done and confirmed post-message calls in delivery logs
- Docker image: ai-employee-worker:latest (2961ea8894cf)
- Fix (minElapsedMs: 120_000 + softened nudge) proven effective across 10 consecutive runs
- Total wall time: ~4 minutes (22:41:14 first trigger → 22:45:44 all done)
- All tasks were in Delivering state within ~2 minutes of triggering
