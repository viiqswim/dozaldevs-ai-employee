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
