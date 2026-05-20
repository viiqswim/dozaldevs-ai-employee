# Learnings — inngest-devserver-output-fix

## 2026-05-20 Task 1: Diagnostic Complete

### Key Findings

- outputID `sid` = sha1(stepName) — deterministic, identical across ALL runs
- `tid` (trace ID) is always empty in Dev Server — no run scoping
- Dev Server uses in-memory SQLite — restart clears contamination
- v1.21.0 does NOT fix contamination — it's hygiene only
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003` (NOT DozalDevs `00000000-0000-0000-0000-000000000002`)
- motivation-bot archetype ID: `e4dd9e63-91ac-490b-ba4f-10246be6fa76`

### Logger Pattern in employee-lifecycle.ts

- `createLogger` is already imported at line 10
- `const log = createLogger('employee-lifecycle')` exists at line 34 (module-level)
- For runId-scoped logging, create a child logger INSIDE the function body:
  `const log = createLogger('employee-lifecycle').child({ taskId, runId })`
  This shadows the module-level `log` — that's intentional and correct.
- `taskId` and `runId` are destructured from function args around line 132-133
- Log OUTSIDE step.run() callbacks — inside = replays on every retry

### Inngest GraphQL v1.21.0 Query Format

```bash
FROM=$(node -e "console.log(new Date(Date.now()-3600000).toISOString())")
curl -s -X POST http://localhost:8288/v0/gql -H "Content-Type: application/json" \
  -d "{\"query\":\"{ runs(first:5, orderBy:[{field:QUEUED_AT,direction:DESC}], filter:{from:\\\"$FROM\\\",status:[COMPLETED]}) { edges { node { id } } } }\"}"
```

### Admin API

- ADMIN_API_KEY: `031ef6bd6f06d069a20957bd3fd2699bb9c0d24c161feae9a9b772c69835f374`
- Trigger: `POST http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot/trigger`
- Status: `GET http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/:id`

### Services State

- Inngest: v1.21.0 on port 8288, tmux `ai-inngest`, log `/tmp/ai-inngest.log`
- Gateway: UP at localhost:7700

## 2026-05-20 Task 5: Cross-Contamination Regression Verification

### Verification Results

- Inngest Dev Server version: `1.21.0-cf0cad33a` (confirmed via `curl http://localhost:8288/dev | jq .version`)
- Two motivation-bot tasks triggered and both reached `Done`:
  - Task 1: `9a188d3a-a032-41c1-b267-753861868530` | runId: `01KS1YN202MZR6BSY1BPQ9FTF2`
  - Task 2: `b654c614-f053-48ad-b61f-20db612a811c` | runId: `01KS1YP58PVJTXMCGQ3QXAJTP3`
- Two distinct `inngest_run_id` values in `tasks.metadata` confirm no cross-contamination

### Log Capture Gotcha

- Gateway logs go to TTY (`/dev/ttys020`), NOT to a file
- `pnpm dev` runs via `scripts/dev.ts` which pipes gateway stdout via `serviceLog('gateway', C.cyan)` directly to the terminal
- No `/tmp/ai-dev.log` for recent runs - that file is from May 18
- Use `tasks.metadata.inngest_run_id` as the `runId` proxy instead of log grep

### Structured Logging Location

- Code: `src/inngest/employee-lifecycle.ts`
- All lifecycle steps include `{ taskId, runId }` in log calls
- `runId` comes from Inngest function context: `async ({ event, step, runId }) => {}`
- Stored in DB: `tasks.metadata.inngest_run_id`
