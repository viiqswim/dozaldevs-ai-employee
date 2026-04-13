
## Task 1 - SDK Permission Field Check
SDK version: 1.3.7
permission in session.create body: NO
DECISION: skip Fix D in Task 2

SessionCreateData.body only accepts: { parentID?: string; title?: string }
No permission field exists in the session.create body type.
The permission field exists elsewhere (e.g., line 857, 1161, 1407 in types.gen.d.ts) but NOT in SessionCreateData.
## Task 2 - Source Bug Fixes Applied
Fix A (hostname 0.0.0.0): DONE
Fix B (opencode.json permission key): DONE
Fix C (healthTimeoutMs 60000 at call site): DONE
Fix D (session-manager.ts): SKIPPED (SDK v1.3.7 has no permission field in body type)
All fixes are in src/workers/ only. No Dockerfile changes.

## Task 3 - TypeScript Check + Commit
tsc worker errors: 0
Commit: fix(worker): fix opencode hostname binding, config key, and health timeout
Files committed: opencode-server.ts, opencode.json, orchestrate.mts

## Task 4 - Docker Image Rebuild
Build: EXIT_CODE:0 (success)
Image: ai-employee-worker:latest rebuilt with fixes from commit d7b7fca
Fix A confirmed: 0.0.0.0 found in /app/dist/workers/lib/opencode-server.js (spawn args contain --hostname 0.0.0.0)
Fix B confirmed: opencode.json has 'permission' (singular) with {"*": "allow", "question": "deny"}
Image SHA: b4ef8ffc561968a65524688bbe39a891e896b81ec7d83cbeb44fc6724803f5fb

## Task 5b - Lifecycle Timeout Fix
MAX_POLLS changed: 40 → 180 (90 min timeout)
Gateway restarted with new code
Commit: fix(lifecycle): extend dev-mode polling timeout from 20 to 90 minutes

## Execution Tracking Fix
Fix A (lifecycle.ts): Creates execution record before docker run, passes EXECUTION_ID env var.
  - `prisma.execution.create({ data: { task_id: taskId, status: 'running' } })` before docker run
  - Adds `-e EXECUTION_ID="${executionId}"` to envArgs
  - Updated updateMany to `update({ where: { id: executionId }, data: { runtime_id: ... } })` for precision
Fix B (orchestrate.mts): Reads EXECUTION_ID from env var (primary), falls back to /tmp/.execution-id
Prisma schema required fields for executions: task_id (FK, required), status (default "pending"). All other fields (runtime_type, runtime_id, agent_version_id, prompt_tokens, etc.) are optional.
Commit: fix(lifecycle): wire execution ID from lifecycle to worker container
