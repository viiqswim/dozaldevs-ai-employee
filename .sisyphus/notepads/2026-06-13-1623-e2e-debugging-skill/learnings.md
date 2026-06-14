# Learnings — 2026-06-13-1623-e2e-debugging-skill

## 2026-06-14 Task: Pre-delegation research

### Logger import paths (CRITICAL)

- From `src/inngest/lib/`: `import { createLogger } from '../../lib/logger.js';`
- From `src/inngest/lifecycle/steps/`: `import { createLogger } from '../../../lib/logger.js';`
- From `src/gateway/slack/handlers/`: `import { createLogger } from '../../../lib/logger.js';`

### Existing logger instances (do NOT re-declare)

- `execute.ts`: `const log = createLogger('lifecycle-execute');` — already exists at top of file
- `delivery-retry.ts`: `const log = createLogger('lifecycle-delivery-retry');` — already exists
- `reviewing-path.ts`: `const log = createLogger('lifecycle-validate-and-submit');` — already exists
- `event-handlers.ts`: `const log = createLogger('slack-handlers');` — already exists at top of file
- `create-task-and-dispatch.ts`: NO logger import at all — must add both import AND instantiation

### create-task-and-dispatch.ts specifics

- File has NO logger import — must add `import { createLogger } from '../../lib/logger.js';`
- Must add `const log = createLogger('task-dispatch');` after imports
- Dedup branch: line 47-49 — `if (duplicates.length > 0) { return { taskId: null, archetypeId: null }; }`
  - Log BEFORE the return: `log.info({ externalId, tenantId, archetypeSlug }, 'Duplicate task suppressed — skipping dispatch');`
- Task created: line 64-65 — `const taskId = tasks[0].id;`
  - Log AFTER this line: `log.info({ taskId, tenantId, archetypeSlug }, 'Task created');`
- Event sent: line 67-71 — `await inngest.send({...})`
  - Log AFTER the send: `log.info({ taskId, tenantId }, 'task.dispatched event sent');`

### execute.ts poll loop location

- Poll loop: lines 84-95, inside `step.run('poll-completion', ...)`
- Loop: `for (let i = 0; i < maxPolls; i++) { ... }`
- Add `log.debug({ taskId, poll: i, status }, 'Polling for completion');` AFTER the status fetch (line 91), BEFORE the break condition (line 92)

### delivery-retry.ts poll loop location

- Delivery poll loop: lines 171-179, inside the `for (let attempt = 0; attempt < 3; attempt++)` outer loop
- Inner loop: `for (let i = 0; i < maxDeliveryPolls; i++) { ... }`
- Add `log.debug({ taskId, attempt, poll: i, status: finalStatus }, 'Polling delivery for completion');` AFTER the status fetch (line 177), BEFORE the break condition (line 178)

### reviewing-path.ts waitForEvent location

- `step.waitForEvent` call: line 409-413
- `timeoutHours` is available in ctx (destructured at line 355)
- `tenantId` is available in ctx (destructured at line 349)
- Add `log.info({ taskId, tenantId, timeoutHours }, 'Awaiting approval event');` BEFORE line 409

### event-handlers.ts early returns

- Receipt log already exists at lines 105-108 — DO NOT duplicate
- Bot-ID guard: line 110 — `if (mention.bot_id) return;`
  - Add BEFORE the return: `log.info({ channel: mention.channel }, 'Ignoring app_mention from bot');`
- DM guard: line 112 — `if (mention.channel.startsWith('D')) return;`
  - Add BEFORE the return: `log.info({ channel: mention.channel }, 'Ignoring app_mention in DM channel');`

## 2026-06-14 Task 6: Wave 1.5 gate + live proof

### Gate results

- `pnpm build` PASS (exit 0); `pnpm lint` PASS (exit 0). Both run via tmux `ai-build` per long-running rule.

### Live task

- Triggered `real-estate-motivation-bot-2` (VLRE, approval_required=false) via admin API.
- TASK_ID `623b76f3-87a2-42d6-a36a-4b8567f84546` reached **Done**. No-approval trace: Received→...→Submitting→Validating→Submitting→Delivering→Done.

### Runtime log-level reality (important for grep-proof)

- Running gateway (pid 22609) has NO `LOG_LEVEL` set → pino defaults to `info` → ALL `log.debug` is suppressed. Confirmed `grep -c '"level":20' /tmp/ai-dev.log` = 0.
- So Gap 2 (`Polling for completion`) and Gap 3 (`Polling delivery for completion`) cannot live-emit unless gateway restarted with `LOG_LEVEL=debug`. Code verified present instead.

### Per-gap proof outcome

- Gap 1 (`Task created`/`task.dispatched event sent`/`Duplicate task suppressed`): code present at create-task-and-dispatch.ts:53,73,80 BUT function is ORPHANED — see below. Cannot emit on any live path.
- Gap 2/3: code present (execute.ts:92, delivery-retry.ts:180); debug-suppressed at info → verified by grep.
- Gap 4 (`Awaiting approval event`, reviewing-path.ts:409): info-level but only fires for approval_required=true; test employee is false → N/A, code-verified.
- Gap 5 (`Ignoring app_mention from bot`/`in DM channel`, event-handlers.ts:111,116): only fires on bot/DM mention → N/A this run, code-verified.

### CRITICAL FINDING — Gap 1 logs are unreachable (orphaned code)

- `createTaskAndDispatch()` (src/inngest/lib/create-task-and-dispatch.ts) has NO live caller. Only refs: its own def + unit test.
- Live dispatch paths bypass it:
  - Admin manual trigger → `dispatchEmployee()` (src/gateway/services/employee-dispatcher.ts), emits `employee/task.dispatched` directly (external_id `manual-dispatch-...`).
  - `guest-message-poll` cron → inline `inngest.send({name:'employee/task.dispatched'})` at src/inngest/triggers/guest-message-poll.ts:222, logs `Created polling task for unresponded lead` (NOT the Gap 1 messages).
- Implication for skill authoring: the "dispatch" log proof for the debugging skill should reference the messages that ACTUALLY emit on live paths (`Created polling task for unresponded lead`, lifecycle `Step complete: load-task`, inngest `publishing event`), OR Gap 1 must be wired into a live path first. Flagged for orchestrator.

## 2026-06-14 Task 6: Gate verification findings

### CRITICAL: createTaskAndDispatch is orphaned dead code

- `createTaskAndDispatch()` in `src/inngest/lib/create-task-and-dispatch.ts` is NEVER called anywhere
- Only reference is its own definition (confirmed via grep — 1 match, the definition itself)
- The Gap 1 logs we added compile and lint clean but CANNOT emit at runtime
- The REAL dispatch path is `src/gateway/services/employee-dispatcher.ts`:
  - `dispatchEmployee()` — used by admin trigger routes
  - `dispatchEmployeeById()` — used by Slack trigger handlers
  - Both emit `employee/task.dispatched` directly via `inngest.send()`
- The skill MUST document `employee-dispatcher.ts` as the actual dispatch step, NOT `create-task-and-dispatch.ts`
- The Gap 1 logging addition is still valid code (no harm), but the skill should note this caveat

### Live task verification (Task 6)

- Triggered `real-estate-motivation-bot-2` (VLRE tenant) → TASK_ID `623b76f3-87a2-42d6-a36a-4b8567f84546`
- Reached Done (terminal) — full no-approval trace verified
- Build: PASS, Lint: PASS
- Gaps 2/3 (debug poll logs): code verified present, require LOG_LEVEL=debug to emit
- Gap 4 (approval wait): code verified present, fires only for approval_required=true employees
- Gap 5 (DM/bot early-return): code verified present, fires only on bot/DM mentions

### Actual dispatch path for the skill's forward trace

Step 3 in the forward trace should be:

- File: `src/gateway/services/employee-dispatcher.ts`
- Functions: `dispatchEmployee()` (admin trigger) / `dispatchEmployeeById()` (Slack trigger)
- What it does: creates task row in DB, emits `employee/task.dispatched` to Inngest
- Log: no dedicated logger in this file currently (the Gap 1 logs are in the orphaned function)
- DB: `tasks` table row created with status `Ready`
- Inngest event: `employee/task.dispatched` → triggers `employee/universal-lifecycle`

## [2026-06-14] Task 8: Local command + SQL verification

- SQL queries: PASS — all 7 Section-3 queries + deliverables bonus executed with ZERO column-not-found errors against TASK_ID 623b76f3-87a2-42d6-a36a-4b8567f84546 (Done). Columns confirmed real in prisma/schema.prisma: tasks(id,status,failure_reason,failure_code,updated_at,compiled_agents_md,raw_event); task_status_log(from_status,to_status,actor,created_at,task_id); executions(task_id,session_transcript,prompt_tokens,completion_tokens,estimated_cost_usd); pending_approvals(task_id); deliverables(execution_id).
- Local commands: PASS — docker ps x3, ls /tmp/employee-623b76f3.log (784KB) + delivery log (2.8MB) + ai-dev.log all exist. `docker logs employee-{id8}` syntax valid ("No such container" expected — container is ephemeral).
- SSE route: CONFIRMED at src/gateway/routes/admin-tasks.ts (`/admin/tenants/:tenantId/tasks/:id/logs`); dashboard React route at dashboard/src/App.tsx (`/dashboard/tasks/:taskId/logs`).
- Cross-links: all 5 present (debugging-lifecycle, production-ops, e2e-testing, feature-verification, long-running-commands).
- Durability: PASS — 0 volatile counts, 0 line-number refs. The broad `:[0-9]+` grep only matches bash-substring syntax `${TASK_ID:0:8}` (5x) and semantic-constant DB/gateway ports 54322/5432/6543/7700 (8x), both allowed.
- Forward-trace file accuracy: all 14 referenced source files exist (0 missing), including the documented orphaned dead-code file create-task-and-dispatch.ts.
- Fixes made to SKILL.md: NONE — skill is fully accurate against the running local stack.
- Evidence: .sisyphus/evidence/task-8-{sql,commands,crosslinks,durability}.txt

## [2026-06-14] Task 9: Prod cross-reference + AGENTS.md registration

- Prod commands cross-referenced: 7 commands, all match (0 mismatches, no fixes needed to SKILL.md)
  - Render API log fetch: exact match vs production-ops SKILL.md lines 44-45
  - Render deploy status: match vs production-ops + prod-debugging-guide
  - Fly Machines list/details/destroy: match vs prod-debugging-guide lines 297-313
  - Supabase Cloud psql (port 5432 session pooler): match vs prod-debugging-guide lines 28, 55
  - Render env-var gotcha (single-var PUT): match vs production-ops + prod-debugging-guide
  - All identifiers verified: service ID srv-d8f1b2gg4nts738dj7jg, project ref gjqrysxpvktmibpkwrvy, Fly app ai-employee-workers, gateway URL ai-employees-laaa.onrender.com
- AGENTS.md registration: both tables updated, grep returns 2 matches
  - Line 128: "If you are about to..." trigger table
  - Line 159: "Dev skills" description table
- Evidence: .sisyphus/evidence/task-9-{registration,prod-xref}.txt (gitignored, local only)
- Commit: 3c75db2b — docs(skills): add end-to-end execution trace & debugging skill
