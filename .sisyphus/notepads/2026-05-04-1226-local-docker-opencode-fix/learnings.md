# Learnings

## [2026-05-04T17:32] Session Start

### Architecture

- `dev-start.ts` sets `USE_LOCAL_DOCKER=1` programmatically — .env value is irrelevant
- `opencode-server.ts` starts OpenCode via `opencode serve --port 4096 --hostname 0.0.0.0 --print-logs`
- `OPENCODE_IDLE_TIMEOUT=300000` controls Instance disposal, NOT server lifetime
- Docker image built 2026-05-04T17:13:42Z (Build 7) — includes keepalive code

### Race Condition (Primary Bug)

- stdout "listening" detection → `resolveOnce(handle)`
- `exit` event → `resolveOnce(null)` (UNCONDITIONAL — the bug)
- If exit fires in same event loop tick as stdout: `null` resolves first → "Failed to start OpenCode server"
- Fix: add `listeningDetected` boolean flag; guard exit handler with `if (!listeningDetected)`

### OpenCode Behavior

- SSE `/event` endpoint closes after ~7s (issue #15149)
- Keepalive reconnects in 50ms loop
- Version 1.14.31 pinned (1.14.33 has 6s exit regression)
- CWD: `/app` (harness line 181)

### Infrastructure

- SUPABASE_URL: http://localhost:54331 (Kong) → rewrites to host.docker.internal:54331 for Docker
- PostgREST returns 200 on port 54331 ✅
- Task ID: f35843e2-67f8-447e-9222-c3f6a47d058f
- Archetype ID: 00000000-0000-0000-0000-000000000015
- VLRE Tenant: 00000000-0000-0000-0000-000000000003

## [2026-05-04T17:53] Task 4 — Build 8 + Container Test

### Build 8 Results
- Docker build EXIT_CODE:0 in ~330s (~5.5 minutes)
- Image SHA: sha256:a6ec0c8830e53c85ce19d2a89a623d1392d8695363e9cd01d7c3bd09d737bc90
- Build log: `.sisyphus/evidence/task-4-build.txt`

### Container Test Results (PASS)
- ✅ "listening" detected: `opencode server listening on http://0.0.0.0:4096`
- ✅ "TCP keepalive connected on port 4096"
- ✅ "Failed to start OpenCode server" NOT in logs
- ✅ Server started successfully, ran for 5s, killed cleanly
- Container test log: `.sisyphus/evidence/task-4-container-test.txt`

### Key Gotchas for Container Testing
- `/workspace` directory does NOT exist in container by default — must `mkdirSync('/workspace', { recursive: true })` before calling `startOpencodeServer`
- `OPENROUTER_API_KEY` must be set — without it, OpenCode exits immediately with code 0 (no error message)
- The harness (`opencode-harness.mjs`) fetches task from PostgREST FIRST — exits early with "Task not found" for fake task IDs. To test OpenCode server startup, test `opencode-server.js` directly via mounted script
- `spawn opencode ENOENT` error when running ESM module without explicit PATH — fixed by ensuring PATH includes `/usr/local/bin`
- The race condition fix (commit 22595e1) is confirmed working: `listeningDetected = true` → `resolveOnce(handle)` fires correctly

### Fix Confirmed Working
The `listeningDetected` boolean guard in `opencode-server.ts` correctly prevents the exit handler from calling `resolveOnce(null)` after listening is detected. The server starts, resolves the promise with a valid handle, and the harness can proceed to create sessions.

## [2026-05-04T20:15Z] Task 5 — E2E Retry Results (v16)

- Attempt: v16 (retry-f35843e2-v16 event ID)
- Task final status: **Submitting** (SUCCESS — not Failed)
- Session duration: ~14 seconds from container start to session.idle (20:06:38 start → 20:06:53 idle)
- Tool calls observed: YES — model called Write tool to write `/tmp/summary.txt`
- Failure reason: none (task is not failed)

### What happened:
1. Container started at 20:06:38
2. OpenCode server listening at 20:06:39 (< 1 second)
3. Session created, prompt injected, LLM called (minimax/minimax-m2.7 via openrouter)
4. Model ran 2 loop steps:
   - Step 1: Model wrote `/tmp/summary.txt` with content `"NO_ACTION_NEEDED: No unresponded guest messages found."`
   - Step 2: Model confirmed (loop exits)
5. Session went idle at 20:06:53 (14 seconds total)
6. Harness read `/tmp/summary.txt`, created deliverable record
7. Harness set task → Submitting, fired `employee/task.completed`
8. Lifecycle processed: detected `NO_ACTION_NEEDED` classification → `skipApproval = true`
9. Lifecycle entered `waitForEvent('wait-for-reply-anyway', timeout: 24h)` 
10. Task stays in `Submitting` for up to 24h, then auto-completes to `Done`

### Root cause of previous "Model did not produce content" failure:
- The v14 run had the `listeningDetected` race condition bug — container exited before harness finished setup
- The Build 8 Docker image (commit 22595e1) fixed this race condition
- v16 with Build 8 succeeded

### Key log lines:
```
[opencode-harness] OpenCode harness starting
[opencode-server] opencode server listening on http://0.0.0.0:4096
service=permission permission=edit pattern=tmp/summary.txt — model wrote summary
[opencode-harness] Read summary from /tmp/summary.txt
[opencode-harness] Deliverable record created
[opencode-harness] Task status → Submitting
[opencode-harness] Inngest event fired: employee/task.completed
[opencode-harness] OpenCode harness complete
EXIT_CODE:0
```

### Why no Slack approval card:
- The model returned `NO_ACTION_NEEDED` → lifecycle code (employee-lifecycle.ts line 446-469) intentionally skips Slack posting
- This is correct behavior, not a failure
- Slack would only be posted if model wrote a real guest message reply

### Infrastructure verdict:
✅ Build 8 Docker image works correctly
✅ minimax/minimax-m2.7 model produces content (no more "Model did not produce content")
✅ Harness reads output files and updates task state
✅ Lifecycle processes employee/task.completed correctly
✅ NO_ACTION_NEEDED path works as designed
