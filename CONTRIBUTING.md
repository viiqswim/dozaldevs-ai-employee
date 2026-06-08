# Contributing to AI Employee Platform

This guide covers the key things you need to know before making changes. It links to the authoritative sources rather than duplicating them.

---

## Active vs Deprecated Components

The platform has a clear boundary between active code and deprecated code. **Do not add features to deprecated components.**

### Active (modify freely)

| Component           | Path                                     | Purpose                                |
| ------------------- | ---------------------------------------- | -------------------------------------- |
| Universal lifecycle | `src/inngest/employee-lifecycle.ts`      | All employee task orchestration        |
| OpenCode harness    | `src/workers/opencode-harness.mts`       | Worker container entry point           |
| Shell tools         | `src/worker-tools/`                      | External service integrations          |
| Gateway routes      | `src/gateway/routes/`                    | HTTP API handlers                      |
| Slack handlers      | `src/gateway/slack/handlers/`            | Slack event/action handlers            |
| Shared lib          | `src/lib/`                               | LLM client, encryption, logging, retry |
| Inngest functions   | `src/inngest/` (except deprecated files) | Durable workflows                      |

### Deprecated (do not touch)

| Component                | Path                              | Reason                                          |
| ------------------------ | --------------------------------- | ----------------------------------------------- |
| Engineering lifecycle    | `src/inngest/lifecycle.ts`        | Engineering employee on hold                    |
| Engineering redispatch   | `src/inngest/redispatch.ts`       | Paired with deprecated lifecycle                |
| Engineering watchdog     | `src/inngest/watchdog.ts`         | On hold with engineering employee               |
| Generic worker harness   | `src/workers/generic-harness.mts` | Replaced by OpenCode harness                    |
| Tool registry            | `src/workers/tools/registry.ts`   | Replaced by shell scripts                       |
| Engineering orchestrator | `src/workers/orchestrate.mts`     | On hold; new archetype-based engineer is active |
| Engineering launcher     | `src/workers/entrypoint.sh`       | Engineering only, on hold                       |
| Engineering worker libs  | `src/workers/lib/` (most files)   | Support deprecated orchestrator                 |

Full deprecated component details: [AGENTS.md](AGENTS.md) — "Deprecated Components" section.

---

## Task-Creation Paths

Two patterns exist for creating tasks. Use the right one for your context.

### Gateway (Prisma) — for HTTP-triggered tasks

The gateway uses Prisma directly. The canonical entry point for Slack-triggered tasks is `dispatchEmployeeById()` in `src/gateway/services/employee-dispatcher.ts`.

```typescript
import { dispatchEmployeeById } from '../services/employee-dispatcher.js';

await dispatchEmployeeById({ archetypeId, tenantId, payload, slackContext });
```

For Jira-triggered tasks, see `src/gateway/services/jira-task-creation.ts`.

### Worker containers (PostgREST) — for lifecycle writes

Worker containers and the Inngest lifecycle write task state through PostgREST (`http://localhost:54331`), not Prisma. The shared client is `src/workers/lib/postgrest-client.ts`.

**Why two patterns?** Workers run inside Docker containers that don't have direct DB access — they go through PostgREST. The gateway runs in the Node.js process with Prisma available. Full unification (ARCH-1) is deferred.

**Critical**: After any Prisma migration that adds a new table, reload the PostgREST schema cache:

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"
```

---

## Adding a New Shell Tool

Shell tools are TypeScript scripts in `src/worker-tools/{service}/` that run inside the worker Docker container. They're the only way AI employees interact with external services.

**Quick start**: Load the `adding-shell-tools` skill in OpenCode, or read the full guide:

- Skill: `.opencode/skills/adding-shell-tools/SKILL.md`
- Guide: `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`

**Key conventions:**

- Use `requireEnv('VAR_NAME')` from `../lib/require-env.js` instead of manual env checks
- Use `getArg(args, '--flag')` from `../lib/get-arg.js` instead of manual `for` loops
- Use `node:` prefix for Node.js built-ins: `import { readFileSync } from 'node:fs'`
- `--help` check comes first in `main()`, mock mode check comes second
- Output JSON to stdout, errors/warnings to stderr
- Every tool that calls an external API needs a mock fixture in `fixtures/{verb}-{noun}.json`

---

## Adding a New Employee

The primary path is the dashboard wizard. It generates all archetype fields from a plain-English description.

1. Open `http://localhost:7700/dashboard/employees/new?tenant=<tenantId>`
2. Describe what the employee does
3. Review and save the generated archetype
4. Set `status` to `active`
5. Trigger via admin API or dashboard

For manual seed-based setup, see [AGENTS.md](AGENTS.md) — "Adding a New Employee" section.

For the full archetype schema and field reference, load the `creating-archetypes` skill.

---

## Running E2E Tests

### Smoke test (fastest — use for any lifecycle change)

```bash
source .env
curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '{task_id: .task_id}'
```

Wait ~60s, then verify:

```bash
TASK_ID=<task_id>
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Done
```

### Full E2E guides

| Guide                                                              | Scenarios | When to use                                     |
| ------------------------------------------------------------------ | --------- | ----------------------------------------------- |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`          | A-F       | Approval paths, terminal states, Slack UX       |
| `docs/testing/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` | A-F       | Rule extraction, feedback consolidation         |
| `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`       | AC1-AC8   | Wizard generation, full lifecycle with approval |

**Minimum for any Slack trigger workflow change**: single-gateway pre-flight + live @mention → Confirm → Done E2E. See [AGENTS.md](AGENTS.md) — "Plan E2E Validation" section.

### Running Tests

| Command                 | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm test`             | Unit suite in watch mode (default — re-runs on file changes) |
| `pnpm test -- --run`    | Unit suite one-shot (used in CI)                             |
| `pnpm test:unit`        | Explicit one-shot unit suite (same as `test -- --run`)       |
| `pnpm test:integration` | DB-backed integration suite (requires running Docker)        |
| `pnpm test:file <path>` | Run a single test file                                       |
| `pnpm test:coverage`    | Unit suite with coverage report                              |

**Single-file example:**

```bash
pnpm test:file tests/unit/lib/classify-message.test.ts
```

Pre-existing skips: `container-boot.test.ts` skips 4 tests when Docker is unavailable. This is expected.

---

## Key Conventions

A few rules that catch most mistakes:

- **Multi-tenancy is mandatory** — every table, query, and API call must be scoped by `tenant_id`
- **Soft deletes only** — use `deleted_at` timestamp, never `DELETE` SQL or Prisma `.delete()`
- **Shared files stay employee-agnostic** — `employee-lifecycle.ts`, `opencode-harness.mts`, and anything in `src/gateway/` or `src/lib/` serves all employees. No employee-specific language in these files.
- **Searchable dropdowns** — use `<SearchableSelect>` from `dashboard/src/components/ui/searchable-select.tsx`, not Radix `<Select>`
- **URL-encode all navigatable state** — tabs, filters, and modals must reflect state in the URL via query params
- **End-user language is non-technical** — "Organization" not "Tenant", "Employee setup" not "Archetype configuration"
- **`pnpm exec tsx`** not bare `tsx` — tsx is not on PATH in this project

Full conventions: [AGENTS.md](AGENTS.md) — "Key Conventions" section.

---

## Git Rules

- Never use `--no-verify`
- Never add `Co-authored-by` lines to commits
- Never reference AI tools in commit messages
- Markdown filenames: `YYYY-MM-DD-HHMM-{name}.md` (run `date "+%Y-%m-%d-%H%M"` first)

---

## Where to Find More

| Need                           | Where to look                                               |
| ------------------------------ | ----------------------------------------------------------- |
| Architecture overview          | `docs/architecture/2026-04-14-0104-full-system-vision.md`   |
| All admin API endpoints        | [AGENTS.md](AGENTS.md) — "Admin API" section                |
| Lifecycle states and debugging | Load `debugging-lifecycle` skill, or `docs/guides/`         |
| Slack integration details      | `docs/guides/2026-05-14-0040-slack-tenant-integration.md`   |
| Production debugging           | `docs/guides/2026-06-01-2246-production-debugging-guide.md` |
| All reference docs             | [AGENTS.md](AGENTS.md) — "Reference Documents" table        |
