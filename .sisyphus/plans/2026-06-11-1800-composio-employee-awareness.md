# Composio Tool Awareness for AI Employees

## TL;DR

> **Quick Summary**: Make AI employees aware of connected Composio apps across creation, execution, and delivery — via repo-committed per-app skills (filtered to connected apps at boot), a runtime action-discovery tool, wizard awareness of connections, and per-phase usage logging.
>
> **Deliverables**:
>
> - An npm generator that writes per-app Composio skill folders into `src/workers/skills/composio-<app>/` (action index + per-action schema files), scoped to connectable apps
> - A CI freshness-check that fails if committed skills are stale (no mutation, no cron)
> - Harness boot-time filtering that deletes unconnected apps' skill folders so employees see only what's connected
> - A `list-actions.ts` runtime discovery tool documented in the platform AGENTS.md as the cache-miss fallback
> - Wizard awareness: detect implied apps, surface connected vs. suggested, feed only connected into generated instructions
> - Per-phase Composio usage logging (`task_composio_calls` gains a `phase` column; `execute.ts` writes the row)
> - Documentation/observability cleanup (false PostgREST claim, non-existent column reference, env manifest)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Wave 1 (schema + generator + tool) → Wave 2 (harness filtering + audit write) → Wave 3 (wizard + CI + docs) → Final Verification

---

## Context

### Original Request

With the new Composio connections, will AI employees know which tools to use? The user asked to investigate awareness across the employee creation, execution, and delivery processes, find gaps, and resolve them — with emphasis on whether OpenCode skills can bridge the gaps. The user chose to address all five identified gaps in one plan.

### Interview Summary

**Key Discussions / Decisions**:

- **Skills live in the repo, not a DB cache**: Metis found there is no file-delivery channel from the gateway to Fly workers (only the database), and skills are baked into the Docker image at build time. Decision: commit per-app skill folders to `src/workers/skills/composio-<app>/`. The repo is the cache.
- **No timed/background jobs (hard user rule)**: An npm generator script produces the skill files; engineers commit them; CI _checks freshness and fails if stale_ — CI never mutates. No cron, no poll, no timer.
- **Per-app skills with bundled action schemas ("skill tree")**: `SKILL.md` is a lightweight action index; bundled `actions/<SLUG>.md` files hold full parameter schemas, read on demand. Confirmed natively supported by OpenCode (bundled files enumerated to the agent; read on demand).
- **No skill names in instructions**: Plain-English instructions ("write a page to Notion") let OpenCode auto-match the skill by description. Eliminates name drift by design.
- **Boot-time filtering by folder deletion**: The harness deletes `composio-*` skill folders for apps the tenant has NOT connected, before OpenCode starts. Certain to hide them (OpenCode can't list absent folders).
- **Generator scope = connectable apps only**: Apps with a Composio auth config set up (`connectable: true`), i.e. the dozens the platform supports — not all 1000+.
- **Cache miss falls back to the runtime discovery tool**: A newly-connected app whose skill hasn't shipped yet gets no skill; the employee discovers its actions live via `list-actions.ts`.
- **Audit via our own tool, not Composio metadata**: Composio accepts no caller correlation field on execute, and the execute response has no `log_id`. So `execute.ts` writes the audit row itself (task_id, tenant_id, toolkit, action, phase).

**Research Findings (grounded)**:

- OpenCode skills are scanned once at session startup — NO hot reload (source-confirmed). All skill files must exist before OpenCode boots. Bundled supporting files are enumerated to the agent and read on demand. Only name+description are in context until a skill is loaded.
- Composio API: `GET /api/v3.1/tools?toolkit_slug=<x>` lists actions WITH `input_parameters` JSON schemas. `GET /api/v3.1/toolkits` returns `meta.version` per toolkit. The execute response contains NO `log_id` (fixture: `data.markdown` + `data.successful`). The execute endpoint accepts no caller `metadata`/`tags`/`correlation_id`.
- `COMPOSIO_API_KEY` already reaches both execution and delivery containers via `PLATFORM_ENV_WHITELIST`.
- `agents-md-compiler.mts` `loadConnectedToolkits()` already injects a runtime "Connected Apps" section (toolkit names only) into the compiled AGENTS.md for both phases.
- Harness boot order (validated): `writeOpencodeAuth` → `loadConnectedToolkits` → write `/app/AGENTS.md` → `runOpencodeSession`/`startOpencodeServer` (cwd `/app`). Filtering slots in after `loadConnectedToolkits`, before server start.

### Metis Review

**Identified Gaps (addressed in this plan)**:

- Original "gateway copies skill folders into container" was impossible (no file channel) → reframed to repo-committed skills + boot-time folder filtering.
- `task_composio_calls` has NO `phase` column → migration added.
- `log_id` was unverified (and is absent) → audit row does not depend on it.
- AGENTS.md documents a non-existent `composio_connection_id` column and a false "no PostgREST access" claim → doc audit task.
- Refresh must be scoped to connectable toolkits only (never all 1000+).
- Cache-miss behavior on the hot path must be explicit → runtime discovery fallback, no skill injected.

---

## Work Objectives

### Core Objective

Give AI employees accurate, lazy-loaded knowledge of the third-party app actions available to them — scoped to what their tenant has connected — across creation, execution, and delivery, with per-phase usage logging, using only repo-committed assets and event-driven (non-timed) regeneration.

### Concrete Deliverables

- `pnpm generate-composio-skills` script + generated `src/workers/skills/composio-<app>/` folders
- CI freshness-check job (fails on stale skills)
- `filterComposioSkills()` harness step (deletes unconnected skill folders pre-boot)
- `src/worker-tools/composio/list-actions.ts` runtime discovery tool + platform AGENTS.md documentation
- Wizard awareness in `archetype-generator.ts` + prompts + `admin-archetype-generate.ts`
- `task_composio_calls.phase` migration + audit write in `execute.ts`
- Documentation/observability fixes

### Definition of Done

- [ ] A task for a tenant with `notion` connected and `gmail` not connected exposes only `composio-notion` skill in the container; `gmail` is absent
- [ ] `execute.ts` produces a `task_composio_calls` row with correct `phase` (verified via psql); `/composio/usage` returns non-empty
- [ ] The wizard surfaces connected vs. suggested apps and feeds only connected ones into generated `execution_steps`
- [ ] CI fails when committed skills are stale
- [ ] Zero Composio API calls occur during task provisioning for cached apps

### Must Have

- Repo-committed skill folders (no DB cache table, no gateway→worker file channel)
- Boot-time deletion of unconnected `composio-*` skill folders
- Per-app skill = action index + bundled per-action schema files
- Runtime `list-actions.ts` fallback for cache misses
- `phase` column migration + `execute.ts` audit write
- Generator scoped to connectable apps only

### Must NOT Have (Guardrails)

- NO object storage / S3 / Supabase-Storage / shared-volume layer
- NO DB cache table for skills (repo replaces it)
- NO cron / timer / background-poll job of any kind
- NO per-task skill generation (generation is a committed-artifact step)
- NO OpenCode skill hot-reload attempt (impossible — scanned once at startup)
- NO blanket PostgREST access to all shell tools (scope to `execute.ts` only)
- NO full per-app action catalogs injected into AGENTS.md (token cost every call) — action indexes belong in lazy skills; keep AGENTS.md to the short Connected-Apps pointer
- NO refreshing all 1000+ toolkits — only `connectable: true` apps
- NO rebuilding the OAuth connect flow or an app-management UI in the wizard
- NO skill names hardcoded in employee instructions
- NO reliance on a Composio `log_id` (absent from execute response)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. Acceptance criteria requiring a human to "manually test/confirm" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES (vitest unit + integration)
- **Automated tests**: Tests-after for shell tools and harness helpers; unit tests for the generator and filtering logic
- **Framework**: vitest
- **Migrations**: via Prisma (load `prisma` skill)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools** (`list-actions.ts`, `execute.ts`): Bash — run with `--help`, `--mock`, missing-arg; assert exit codes and JSON shape
- **DB assertions**: psql against `ai_employee` (zero rows = failure), not just PostgREST
- **Container/skill assertions**: `docker exec <container> ls /app/.opencode/skills/` + grep
- **Wizard**: curl the generate endpoint; assert response JSON + `archetypes` DB row
- **Full lifecycle**: AI Employee E2E guide (AC1–AC8)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — independent foundations):
├── Task 1: Prisma migration — add `phase` to task_composio_calls [quick]
├── Task 2: Composio actions client + skill generator core [deep]
├── Task 3: list-actions.ts runtime discovery shell tool [unspecified-high]
└── Task 4: Connectable-apps resolver (reuse catalog connectableSet) [quick]

Wave 2 (After Wave 1 — consumers of the foundations):
├── Task 5: pnpm generate-composio-skills script + commit generated folders (depends: 2, 4) [deep]
├── Task 6: Harness boot-time skill filtering — filterComposioSkills() (depends: none structurally; pairs with skills existing) [unspecified-high]
├── Task 7: execute.ts audit write — phase + DB row (depends: 1) [unspecified-high]
└── Task 8: Platform AGENTS.md — document list-actions.ts fallback (depends: 3) [quick]

Wave 3 (After Wave 2 — creation-time + guardrails + docs):
├── Task 9: Wizard Composio awareness — generator + prompts + route (depends: 4) [deep]
├── Task 10: CI freshness-check for committed skills (depends: 5) [unspecified-high]
├── Task 11: COMPOSIO_API_KEY in machine-provisioner manifest [quick]
└── Task 12: Documentation audit — fix false PostgREST claim + non-existent column (depends: 7) [writing]

Wave FINAL (After ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA + live E2E (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 2 → Task 5 → Task 10 → Final
Max Concurrent: 4
```

### Dependency Matrix

- **1**: deps none → blocks 7
- **2**: deps none → blocks 5
- **3**: deps none → blocks 8
- **4**: deps none → blocks 5, 9
- **5**: deps 2,4 → blocks 10
- **6**: deps none (needs skills to exist for full test; structurally independent) → blocks Final
- **7**: deps 1 → blocks 12
- **8**: deps 3 → blocks Final
- **9**: deps 4 → blocks Final
- **10**: deps 5 → blocks Final
- **11**: deps none → blocks Final
- **12**: deps 7 → blocks Final

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick` (+prisma), T2 → `deep`, T3 → `unspecified-high` (+adding-shell-tools), T4 → `quick`
- **Wave 2**: T5 → `deep`, T6 → `unspecified-high`, T7 → `unspecified-high` (+data-access-conventions), T8 → `quick`
- **Wave 3**: T9 → `deep` (+creating-archetypes), T10 → `unspecified-high`, T11 → `quick`, T12 → `writing`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+e2e-testing, +playwright), F4 → `deep`

---

## TODOs

> Implementation + Test = ONE task. EVERY task has a Recommended Agent Profile, Parallelization info, References, and QA Scenarios.

- [x] 1. Prisma migration — add `phase` column to `task_composio_calls`

  **What to do**:
  - Add a `phase` field (String, nullable) to the `TaskComposioCall` model in `prisma/schema.prisma` (existing fields: `id, task_id, tenant_id, toolkit, tool_name, called_at`).
  - Create + apply the migration. Reload the PostgREST schema cache (`NOTIFY pgrst, 'reload schema'`).
  - `phase` values: `'execution'` | `'delivery'` (free string; documented in a comment).

  **Must NOT do**:
  - Do NOT add any other column or table. Do NOT create a skill-cache table.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single schema change + migration
  - **Skills**: [`prisma`] — schema/migration/seed conventions, schema-cache reload requirement

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 7 · Blocked By: None

  **References**:
  - `prisma/schema.prisma` (TaskComposioCall model) — add `phase String?`
  - `prisma` skill — migration workflow, soft-delete conventions, PostgREST schema reload
  - AGENTS.md § Database — `task_composio_calls` field list and the schema-cache reload requirement

  **Acceptance Criteria**:
  - [ ] `psql … -c "\d task_composio_calls"` shows the `phase` column
  - [ ] `pnpm build` clean

  **QA Scenarios**:

  ```
  Scenario: Migration applies and column exists
    Tool: Bash (psql)
    Steps:
      1. Run the migration via prisma
      2. psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d task_composio_calls"
      3. Assert output contains a row for `phase`
    Expected Result: phase column present, type text, nullable
    Evidence: .sisyphus/evidence/task-1-schema.txt

  Scenario: PostgREST sees the new column
    Tool: Bash (curl)
    Steps:
      1. curl PostgREST task_composio_calls with select=phase (limit 0)
      2. Assert HTTP 200 (not a 'column does not exist' error)
    Expected Result: 200, no schema error
    Evidence: .sisyphus/evidence/task-1-postgrest.txt
  ```

  **Commit**: YES — `feat(db): add phase column to task_composio_calls`

- [ ] 2. Composio actions client + skill generator core

  **What to do**:
  - Build a reusable module that, given a toolkit slug, fetches its actions WITH input schemas from Composio (`GET /api/v3.1/tools?toolkit_slug=<x>&limit=1000`) and renders a skill folder in memory: a `SKILL.md` action index (action slug + one-line purpose, ultra-specific frontmatter `description` so the right app-skill loads only when that app is relevant) and one `actions/<SLUG>.md` per action containing the full parameter schema (field name, type, required/optional).
  - Pure generation logic (no filesystem side effects here — the script in Task 5 writes to disk). Return a structured representation `{ skillMd, actionFiles: Record<slug, md> }`.
  - Frontmatter `name` derived deterministically as `composio-<slug>`; valid per the skill name regex `^[a-z0-9]+(-[a-z0-9]+)*$`.

  **Must NOT do**:
  - Do NOT write to disk or the DB. Do NOT generate for all 1000+ toolkits (Task 4 supplies the connectable subset).
  - Do NOT inline full schemas into `SKILL.md` (keep it an index; schemas go in `actions/`).

  **Recommended Agent Profile**:
  - **Category**: `deep` — Composio API integration + rendering logic with edge cases
  - **Skills**: [`data-access-conventions`] — `createHttpClient` factory, config.ts env access for `COMPOSIO_API_KEY`

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 5 · Blocked By: None

  **References**:
  - `src/gateway/routes/composio-catalog.ts` — existing Composio SDK usage + caching pattern, how `toolkits.get` / `authConfigs.list` are called
  - `src/lib/config.ts` (`COMPOSIO_API_KEY`) — env access pattern
  - Composio `GET /api/v3.1/tools?toolkit_slug=<x>` — returns `slug`, `name`, `description`, `input_parameters` (JSON Schema). Pass `toolkit_versions=latest` to get the full action set; pagination via `cursor`/`next_cursor`
  - OpenCode skills docs — frontmatter fields (`name`, `description` only recognized; description 1–1024 chars), bundled files convention
  - `src/lib/http-client.ts` (`createHttpClient`) — outbound HTTP factory

  **Acceptance Criteria**:
  - [ ] Unit test: given a mocked Composio tools response for `notion`, the module returns a `SKILL.md` listing action slugs and one `actions/NOTION_*.md` per action with its params
  - [ ] `description` frontmatter is app-specific and ≤1024 chars

  **QA Scenarios**:

  ```
  Scenario: Generates index + per-action schema files from a mocked toolkit
    Tool: Bash (vitest)
    Steps:
      1. Run the unit test with a fixture Composio tools response (>=3 notion actions)
      2. Assert returned skillMd contains each action slug as an index entry
      3. Assert actionFiles has one entry per action, each containing the param field names
    Expected Result: index lists N actions; N action files with schemas
    Evidence: .sisyphus/evidence/task-2-generator.txt

  Scenario: Empty/unknown toolkit handled gracefully
    Tool: Bash (vitest)
    Steps:
      1. Run with a toolkit that returns zero actions
      2. Assert it returns an empty-but-valid result (no throw)
    Expected Result: no crash; empty index
    Evidence: .sisyphus/evidence/task-2-empty.txt
  ```

  **Commit**: YES — `feat(composio): skill-folder generator core`

- [ ] 3. `list-actions.ts` runtime discovery shell tool

  **What to do**:
  - Add `src/worker-tools/composio/list-actions.ts` following the shell-tool conventions. `--toolkit <name>` (required) → calls Composio `GET /api/v3.1/tools?toolkit_slug=<name>` and prints a JSON list of `{ slug, name, description, input_parameters }`. Support `--help`, `--mock` (fixture), and exit codes (1 on missing `--toolkit`, non-zero on HTTP error).
  - Add a `__fixtures__/list-actions.json` fixture.
  - Read `COMPOSIO_API_KEY` via `requireEnv`.

  **Must NOT do**:
  - Do NOT give it DB access. Do NOT add it to any archetype's `tool_registry` automatically (it's a platform fallback documented in AGENTS.md).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`adding-shell-tools`] — file structure, CLI pattern, mock fixtures, `requireEnv`, `unescapeShellArg`

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 8 · Blocked By: None

  **References**:
  - `src/worker-tools/composio/execute.ts` — sibling tool: CLI parsing (`getArg`), `requireEnv`, mock mode, HTTP + error handling shape to mirror
  - `src/worker-tools/knowledge_base/search.ts` — existing tool that reads via PostgREST (pattern reference)
  - `adding-shell-tools` skill — full checklist
  - Composio `GET /api/v3.1/tools?toolkit_slug=<x>` — response shape

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/composio/list-actions.ts --help` exits 0
  - [ ] `--mock --toolkit notion` returns a JSON action list, exits 0
  - [ ] Missing `--toolkit` exits 1

  **QA Scenarios**:

  ```
  Scenario: Mock mode lists actions
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/composio/list-actions.ts --mock --toolkit notion
      2. Assert stdout is valid JSON array with at least one {slug,...}
      3. Assert exit code 0
    Expected Result: JSON action list, exit 0
    Evidence: .sisyphus/evidence/task-3-mock.txt

  Scenario: Missing required arg fails cleanly
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/composio/list-actions.ts --mock  (no --toolkit)
      2. Assert non-zero exit and an error message on stderr
    Expected Result: exit 1, error printed
    Evidence: .sisyphus/evidence/task-3-missing-arg.txt
  ```

  **Commit**: YES — `feat(composio): add list-actions runtime discovery tool`

- [ ] 4. Connectable-apps resolver

  **What to do**:
  - Extract/expose a reusable function that returns the set of `connectable: true` toolkit slugs (apps with a Composio auth config set up) — the same computation `composio-catalog.ts` already performs via `authConfigs.list()`.
  - This is the scope input for both the generator script (Task 5) and the wizard awareness (Task 9).

  **Must NOT do**:
  - Do NOT return the full 1000+ catalog. Do NOT couple this to a tenant (connectable is global; connected is tenant-scoped).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`data-access-conventions`]

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 5, 9 · Blocked By: None

  **References**:
  - `src/gateway/routes/composio-catalog.ts:170-186` — `connectableCache` / `authConfigs.list()` logic to extract
  - `src/lib/config.ts` (`COMPOSIO_API_KEY`)

  **Acceptance Criteria**:
  - [ ] Unit test: given a mocked `authConfigs.list()`, returns the set of slugs
  - [ ] Returns a bounded set (dozens), never the full catalog

  **QA Scenarios**:

  ```
  Scenario: Returns connectable slugs from mocked auth configs
    Tool: Bash (vitest)
    Steps:
      1. Mock authConfigs.list() with 3 auth configs (notion, gmail, linear)
      2. Call the resolver
      3. Assert it returns exactly {notion, gmail, linear}
    Expected Result: the 3 connectable slugs
    Evidence: .sisyphus/evidence/task-4-resolver.txt
  ```

  **Commit**: YES — `feat(composio): connectable-apps resolver`

- [ ] 5. `pnpm generate-composio-skills` script + commit generated folders

  **What to do**:
  - Add a script (e.g. `scripts/generate-composio-skills.ts`, wired as `pnpm generate-composio-skills`) that: resolves connectable apps (Task 4) → for each, runs the generator core (Task 2) → writes `src/workers/skills/composio-<app>/SKILL.md` + `src/workers/skills/composio-<app>/actions/<SLUG>.md`.
  - Deterministic output (stable ordering, stable formatting) so the CI diff-check (Task 10) is reliable.
  - Run it once and COMMIT the generated folders so they ship in the Docker image (`COPY src/workers/skills/`).

  **Must NOT do**:
  - Do NOT run on a timer or in a background job. Do NOT generate for non-connectable apps. Do NOT write to the DB.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`data-access-conventions`]

  **Parallelization**: Can Run In Parallel: NO (depends on 2,4) · Wave 2 · Blocks: 10 · Blocked By: 2, 4

  **References**:
  - Task 2 generator core + Task 4 resolver (the two inputs)
  - `package.json` scripts block — how existing `tsx` scripts are wired
  - `src/workers/skills/tool-usage-reference/SKILL.md` — example committed skill layout/format
  - AGENTS.md § "rebuild Docker after every worker change" — `src/workers/skills/` is baked into the image, not bind-mounted

  **Acceptance Criteria**:
  - [ ] `pnpm generate-composio-skills` writes `composio-<app>/SKILL.md` + `actions/*.md` for each connectable app
  - [ ] Re-running produces an identical tree (deterministic — git diff empty on second run)

  **QA Scenarios**:

  ```
  Scenario: Generates committed skill folders for connectable apps
    Tool: Bash
    Steps:
      1. pnpm generate-composio-skills (mock/fixture mode if no live key)
      2. ls src/workers/skills/ | grep composio-
      3. Assert at least one composio-<app>/SKILL.md and composio-<app>/actions/ exist
    Expected Result: skill folders present with index + action files
    Evidence: .sisyphus/evidence/task-5-generate.txt

  Scenario: Deterministic output (idempotent)
    Tool: Bash (git)
    Steps:
      1. Run generator, commit
      2. Run generator again
      3. git status --short on src/workers/skills/
    Expected Result: empty diff on second run
    Evidence: .sisyphus/evidence/task-5-idempotent.txt
  ```

  **Commit**: YES — `feat(composio): generate-composio-skills script + generated skill folders`

- [ ] 6. Harness boot-time skill filtering — `filterComposioSkills()`

  **What to do**:
  - Add a harness helper `filterComposioSkills(connectedToolkits: string[])` that lists `/app/.opencode/skills/`, finds all `composio-*` directories, and `rm -rf`s any whose `<app>` is NOT in `connectedToolkits`.
  - Call it in BOTH `execution-phase.mts` and `delivery-phase.mts` AFTER `loadConnectedToolkits()` and BEFORE the OpenCode server starts (validated insertion point: after line ~176 in execution-phase, ~93 in delivery-phase, before `runOpencodeSession`).
  - Log which skills were kept vs. removed.

  **Must NOT do**:
  - Do NOT use opencode.json permission-deny (unverified for listing). Do NOT touch non-composio skills. Do NOT run after the server has started (skills are scanned once at boot).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: Final · Blocked By: None (structurally; full E2E needs Task 5 skills present)

  **References**:
  - `src/workers/lib/execution-phase.mts` (~line 176 `loadConnectedToolkits`, ~190 AGENTS.md write, ~238 `runOpencodeSession`) — exact insertion point
  - `src/workers/lib/delivery-phase.mts` (~93 `loadConnectedToolkits`, ~144 `runOpencodeSession`) — same pattern
  - `src/workers/lib/harness-helpers.mts` (~264 existing `readdirSync('/app/.opencode/skills')`) — existing skills-dir read to mirror
  - `src/workers/lib/agents-md-compiler.mts` `loadConnectedToolkits()` — source of the connected list

  **Acceptance Criteria**:
  - [ ] In a container for a tenant with only `notion` connected, only `composio-notion` remains under `/app/.opencode/skills/`; other `composio-*` folders are gone; non-composio skills untouched
  - [ ] Runs before OpenCode server start

  **QA Scenarios**:

  ```
  Scenario: Only connected app skills survive in-container
    Tool: Bash (docker exec) / interactive_bash
    Preconditions: Trigger a task for a tenant with notion connected, gmail NOT connected
    Steps:
      1. docker exec <employee-container> ls /app/.opencode/skills/
      2. Assert composio-notion present
      3. Assert composio-gmail absent
      4. Assert a non-composio skill (e.g. tool-usage-reference) still present
    Expected Result: only connected composio skills + all non-composio skills
    Evidence: .sisyphus/evidence/task-6-filter.txt

  Scenario: Tenant with zero connections has no composio-* skills
    Tool: Bash (docker exec)
    Steps:
      1. Trigger a task for a tenant with no Composio connections
      2. docker exec <container> ls /app/.opencode/skills/ | grep composio- || echo NONE
    Expected Result: NONE
    Evidence: .sisyphus/evidence/task-6-zero.txt
  ```

  **Commit**: YES — `feat(worker): filter composio skills to connected apps at boot`

- [ ] 7. `execute.ts` audit write — phase + DB row

  **What to do**:
  - After a successful Composio execute call, `execute.ts` POSTs a row to `task_composio_calls` via PostgREST: `task_id` (from `TASK_ID` env), `tenant_id` (from `TASK_TENANT_ID`), `toolkit`, `tool_name` (the action slug), `phase`.
  - Determine `phase` from an env var the container already knows (execution vs delivery container). If the env isn't set, write `phase` null — do NOT fail the call.
  - The audit write must NOT break the tool: if the PostgREST write fails, log and continue (the Composio result still returns).
  - Use `makePostgrestHeaders` / `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (already in container env).

  **Must NOT do**:
  - Do NOT depend on a Composio `log_id` (absent). Do NOT grant PostgREST access to other shell tools. Do NOT let an audit failure fail the execute call.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`data-access-conventions`] — PostgREST headers, repository boundary, env access in worker tools

  **Parallelization**: Can Run In Parallel: NO (depends on 1) · Wave 2 · Blocks: 12 · Blocked By: 1

  **References**:
  - `src/worker-tools/composio/execute.ts` — the file to modify (success path at ~line 121)
  - `src/worker-tools/knowledge_base/search.ts` — existing tool that reads PostgREST (proves shell-tool PostgREST access; mirror its header/auth approach)
  - `src/inngest/lib/postgrest-headers.ts` (`makePostgrestHeaders`) — canonical header factory
  - `prisma/schema.prisma` TaskComposioCall — column names to write
  - Determine which env var carries the phase: check `machine-provisioner.ts` / `delivery-retry.ts` for an existing execution-vs-delivery signal; if none, define one and document it

  **Acceptance Criteria**:
  - [ ] A real execute call inserts a `task_composio_calls` row (verified via psql, zero rows = failure)
  - [ ] Execution-phase call writes `phase='execution'`; delivery-phase call writes `phase='delivery'`
  - [ ] If PostgREST write fails, the execute call still returns the Composio result (exit 0)

  **QA Scenarios**:

  ```
  Scenario: Successful call writes an audit row
    Tool: Bash (run tool + psql)
    Preconditions: A task exists; COMPOSIO + SUPABASE env set
    Steps:
      1. Run execute.ts for a connected toolkit/action (mock the Composio HTTP if needed, but exercise the DB write path)
      2. psql … -c "SELECT task_id, toolkit, tool_name, phase FROM task_composio_calls WHERE task_id='<id>'"
      3. Assert exactly one row with correct toolkit/action/phase
    Expected Result: 1 row, correct fields
    Evidence: .sisyphus/evidence/task-7-audit-row.txt

  Scenario: Audit write failure does not break the call
    Tool: Bash
    Steps:
      1. Run execute.ts with an invalid SUPABASE_URL (force the audit POST to fail)
      2. Assert the Composio result is still printed and exit code 0
    Expected Result: tool succeeds despite audit failure
    Evidence: .sisyphus/evidence/task-7-resilient.txt
  ```

  **Commit**: YES — `feat(composio): log execute calls to task_composio_calls with phase`

- [ ] 8. Platform AGENTS.md — document `list-actions.ts` fallback

  **What to do**:
  - In the PLATFORM-LEVEL worker base config (`src/workers/config/agents.md`), document the `list-actions.ts` runtime discovery tool as the way an employee finds available actions for a connected app on demand (cache-miss fallback). Keep it concise.
  - Frame it generically (no tenant/employee-specific language — this is shared by all employees).

  **Must NOT do**:
  - Do NOT inject full action catalogs here (token cost every call). Do NOT name specific skills. Keep the existing "Connected Apps" runtime injection intact.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: Final · Blocked By: 3

  **References**:
  - `src/workers/config/agents.md` — platform base config (the always-on AGENTS.md layer)
  - `src/workers/lib/agents-md-compiler.mts` `buildConnectedAppsSection()` — existing Connected-Apps section to complement, not duplicate
  - Task 3 `list-actions.ts` CLI contract

  **Acceptance Criteria**:
  - [ ] `src/workers/config/agents.md` documents `list-actions.ts` with its CLI usage
  - [ ] No employee-specific language; no full action catalog inlined

  **QA Scenarios**:

  ```
  Scenario: Platform AGENTS.md documents the discovery tool
    Tool: Bash (grep)
    Steps:
      1. grep -i "list-actions" src/workers/config/agents.md
      2. Assert it appears with --toolkit usage
    Expected Result: documented
    Evidence: .sisyphus/evidence/task-8-doc.txt
  ```

  **Commit**: YES — `docs(worker): document list-actions discovery tool in platform agents.md`

- [ ] 9. Wizard Composio awareness — generator + prompts + route

  **What to do**:
  - In `admin-archetype-generate.ts`: query the tenant's active connections (`composio_connections`) AND the connectable-apps set (Task 4). Pass both to the generator.
  - Widen `ArchetypeGenerator.generate(...)` to accept `{ connectedToolkits, connectableToolkits }`.
  - In the generator prompt (`archetype-generator-prompts.ts`): inject a "Connected Apps" block so the LLM produces `execution_steps` that reference ONLY connected apps via `execute.ts --toolkit <connected-app>`.
  - The generate endpoint response must surface, to the human, which implied apps are CONNECTED vs SUGGESTED (not connected). Suggested apps are advisory only — never written into `execution_steps`.
  - The existing refine input box already lets the user react; no new UI flow.

  **Must NOT do**:
  - Do NOT write unconnected apps into `execution_steps` (they fail at runtime — Composio rejects with HTTP 400). Do NOT rebuild the OAuth/connect flow or an app-management UI. Do NOT hardcode skill names.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`creating-archetypes`, `api-design`] — archetype schema fields + generator prompt; `sendSuccess`/`sendError`, Zod, UUID_REGEX

  **Parallelization**: Can Run In Parallel: NO (depends on 4) · Wave 3 · Blocks: Final · Blocked By: 4

  **References**:
  - `src/gateway/routes/admin-archetype-generate.ts` (~line 64-86) — where modelCatalog is fetched + passed; add composio queries here
  - `src/gateway/services/archetype-generator.ts` — `generate()` signature + `buildSystemPrompt()`
  - `src/gateway/services/prompts/archetype-generator-prompts.ts` — system prompt to inject the Connected Apps block
  - `src/repositories/composio-connection-repository.ts` `getActiveConnections(tenantId)` — tenant's connected toolkits
  - Task 4 connectable resolver
  - `creating-archetypes` skill — `execution_steps`, `tool_registry`, generator quality

  **Acceptance Criteria**:
  - [ ] For a tenant with `notion` connected, a job implying Notion → generated `execution_steps` reference `execute.ts --toolkit notion`
  - [ ] An implied-but-unconnected app appears in the response as a SUGGESTION and is NOT in `execution_steps`
  - [ ] Zero connected apps → no Composio execute calls in `execution_steps`

  **QA Scenarios**:

  ```
  Scenario: Connected app flows into instructions; unconnected becomes a suggestion
    Tool: Bash (curl + jq) + psql
    Preconditions: tenant has notion connected, gmail not connected
    Steps:
      1. curl the generate endpoint with a description implying both Notion and email
      2. Assert response.execution_steps mentions toolkit notion
      3. Assert response surfaces gmail under a suggested/connectable list
      4. Assert execution_steps does NOT contain a gmail execute call
    Expected Result: notion in steps; gmail only as suggestion
    Evidence: .sisyphus/evidence/task-9-wizard.txt

  Scenario: No connections → no composio calls generated
    Tool: Bash (curl + jq)
    Steps:
      1. curl generate for a tenant with zero connections, Notion-ish description
      2. Assert execution_steps contains no composio execute invocation
    Expected Result: clean, no composio steps
    Evidence: .sisyphus/evidence/task-9-none.txt
  ```

  **Commit**: YES — `feat(wizard): make archetype generator aware of connected Composio apps`

- [ ] 10. CI freshness-check for committed skills

  **What to do**:
  - Add a CI job/step (in the existing test workflow) that runs the generator into a temp/scratch location (or in-place then `git diff`), and FAILS if the committed `src/workers/skills/composio-*` content differs from freshly generated output.
  - The job must NOT commit or mutate anything — it only checks and fails on drift.
  - Must run deterministically (mock/fixture or a CI-provided `COMPOSIO_API_KEY`).

  **Must NOT do**:
  - Do NOT auto-commit. Do NOT introduce a scheduled/cron workflow. Do NOT regenerate in production.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**: Can Run In Parallel: NO (depends on 5) · Wave 3 · Blocks: Final · Blocked By: 5

  **References**:
  - `.github/workflows/deploy.yml` — existing test/build job structure to extend (the `test` job)
  - Task 5 generator script (the command CI runs)
  - AGENTS.md § CI/CD — how the pipeline is structured

  **Acceptance Criteria**:
  - [ ] CI step fails when committed skills are stale (simulate by editing a generated file)
  - [ ] CI step passes when skills are up to date
  - [ ] The step performs no commit/mutation

  **QA Scenarios**:

  ```
  Scenario: Stale skills fail CI (local simulation)
    Tool: Bash
    Steps:
      1. Hand-edit a committed actions/*.md to diverge from generated output
      2. Run the freshness-check command locally
      3. Assert it exits non-zero
    Expected Result: non-zero exit (drift detected)
    Evidence: .sisyphus/evidence/task-10-stale.txt

  Scenario: Fresh skills pass
    Tool: Bash
    Steps:
      1. Regenerate + run the freshness-check
      2. Assert exit 0
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/task-10-fresh.txt
  ```

  **Commit**: YES — `ci: fail build when committed composio skills are stale`

- [ ] 11. `COMPOSIO_API_KEY` in machine-provisioner manifest

  **What to do**:
  - Add `COMPOSIO_API_KEY` to `localCriticalVars` / `flyCriticalVars` in `machine-provisioner.ts` so it appears in `PLATFORM_ENV_MANIFEST` for debug visibility (it already reaches the container via the whitelist; this is observability only).

  **Must NOT do**:
  - Do NOT change how the key is injected (it already works). Observability only.

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: Final · Blocked By: None

  **References**:
  - `src/inngest/lifecycle/lib/machine-provisioner.ts` (~lines 198-218 / 250-263 — `localCriticalVars` / `flyCriticalVars`)
  - `src/repositories/tenant-env-loader.ts:14` — confirms key is already in PLATFORM_ENV_WHITELIST

  **Acceptance Criteria**:
  - [ ] `COMPOSIO_API_KEY` appears in the critical-vars manifest output
  - [ ] `pnpm build` clean

  **QA Scenarios**:

  ```
  Scenario: Key appears in the debug manifest
    Tool: Bash (grep)
    Steps:
      1. grep COMPOSIO_API_KEY src/inngest/lifecycle/lib/machine-provisioner.ts
      2. Assert it is in the critical-vars list(s)
    Expected Result: present
    Evidence: .sisyphus/evidence/task-11-manifest.txt
  ```

  **Commit**: YES — `chore(worker): surface COMPOSIO_API_KEY in env manifest for debugging`

- [ ] 12. Documentation audit — fix false PostgREST claim + non-existent column

  **What to do**:
  - Fix the AGENTS.md line stating "shell tools have no PostgREST access" — false; `execute.ts` now writes via PostgREST and `knowledge_base/search.ts` already reads. Reword to reflect reality and the new audit write.
  - Find and fix the AGENTS.md reference to a non-existent `composio_connection_id` column on `composio_connections` (schema has no such column — verify against `prisma/schema.prisma`).
  - Audit ALL other Composio claims in AGENTS.md against the actual schema/code and correct any drift (per the Documentation Discrepancy rule).

  **Must NOT do**:
  - Do NOT add volatile counts/line-numbers (durability rule). Keep edits factual and durable.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: Can Run In Parallel: NO (depends on 7 for the accurate PostgREST wording) · Wave 3 · Blocks: Final · Blocked By: 7

  **References**:
  - AGENTS.md — the `task_composio_calls` description ("Currently unpopulated (shell tools have no PostgREST access)") and the `composio_connections` description (mentions `composio_connection_id`)
  - `prisma/schema.prisma` (TaskComposioCall, ComposioConnection) — ground truth for column names
  - Task 7 (the actual new write behavior to document accurately)

  **Acceptance Criteria**:
  - [ ] AGENTS.md no longer claims shell tools lack PostgREST access; describes the audit write accurately
  - [ ] AGENTS.md no longer references a non-existent `composio_connection_id` column
  - [ ] All Composio doc claims match `prisma/schema.prisma`

  **QA Scenarios**:

  ```
  Scenario: False/incorrect claims removed
    Tool: Bash (grep)
    Steps:
      1. grep -n "no PostgREST access" AGENTS.md  → expect no stale claim
      2. grep -n "composio_connection_id" AGENTS.md → expect none, or only where the column truly exists
      3. Cross-check column names against prisma/schema.prisma
    Expected Result: docs match schema
    Evidence: .sisyphus/evidence/task-12-docs.txt
  ```

  **Commit**: YES — `docs: correct composio PostgREST + schema claims in AGENTS.md`

- [ ] 13. **LIVE END-TO-END VERIFICATION — trigger a real employee that uses a connected Composio app**

  > This is the capstone. It does NOT check that code exists or run unit/integration tests. It triggers a REAL AI employee, watches it actually use Composio against a connected app, and verifies the full chain: skills in container → execution steps → tool call → DB audit row → delivery → Slack. Run this AFTER all of Tasks 1–12 are complete and the Docker image is rebuilt.

  **Preconditions (verify ALL before starting)**:
  - Both seeded tenants already have **Notion connected** (verified: `composio_connections` has active `notion` rows for tenant `...0002` and `...0003`). Use Notion as the live connected app.
  - Services healthy: `curl localhost:7700/health` → ok; `curl localhost:8288/health` → ok; Socket Mode connected (`tail /tmp/ai-dev.log | grep -i "socket mode"`).
  - **Docker image rebuilt** after all worker/skill changes: `docker build -t ai-employee-worker:latest .` (run in tmux per long-running-commands skill). This is mandatory — the committed Composio skills (Task 5) and the boot-time filter (Task 6) only ship via a rebuild.
  - Single-gateway pre-flight: `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` returns `1` (kill zombies if more).

  **What to do** (create + trigger a Notion-using test employee):
  1. **Create a throwaway test employee** for tenant `00000000-0000-0000-0000-000000000003` (VLRE, has Notion connected) whose job is a simple Notion action — e.g. "read a specific Notion page and post a one-line summary to Slack." Use the wizard endpoint (`POST /admin/tenants/:tenantId/archetypes/...generate` path) so this ALSO exercises Task 9 (wizard awareness) end-to-end. Confirm the generated `execution_steps` reference `execute.ts --toolkit notion` and that Notion shows as CONNECTED in the response. Set the model to `deepseek/deepseek-v4-flash` (reliable bash tool calling), `runtime: opencode`, `vm_size: performance-1x`, `status: active`, `approval_required: false` (auto-completes — simpler trace) OR `true` if you want to verify the approval path too.
  2. **Trigger it** via the manual employee trigger: `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/<slug>/trigger` with `Authorization: Bearer $SERVICE_TOKEN`. Capture the returned task ID.
  3. **While it's Executing, inspect the container** to confirm skill filtering worked.
  4. **After it completes, verify the full chain** via the checkpoints below.

  **Must NOT do**:
  - Do NOT accept "the code looks right" or "unit tests pass" as evidence. This task REQUIRES a real task ID, a real container inspection, a real DB audit row, and a real Slack/delivery artifact.
  - Do NOT skip the Docker rebuild. Do NOT leave the throwaway employee active — soft-delete it at the end.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`, `creating-archetypes`, `playwright`] — trigger methods, lifecycle state queries, archetype setup, Slack/browser verification

  **Parallelization**: Can Run In Parallel: NO — runs after ALL of Tasks 1–12 · Final implementation step · Blocked By: 1,2,3,4,5,6,7,8,9,10,11,12

  **References**:
  - `e2e-testing` skill — prerequisites checklist, manual trigger curl, `task_status_log` queries, container inspection, tmux rules, evidence requirements
  - `debugging-lifecycle` skill — the 13 lifecycle states, stuck-state diagnostics, container log location (`/tmp/employee-{taskId.slice(0,8)}.log`)
  - AGENTS.md § "Recommended for E2E testing" — `deepseek/deepseek-v4-flash` model; `performance-1x` VM requirement for opencode runtime
  - Connected app: `notion` (active for tenants `...0002` and `...0003`)
  - Task 9 (wizard), Task 6 (filter), Task 7 (audit) — the three behaviors this E2E exercises live

  **Acceptance Criteria** (every one agent-executable, zero human "looks good"):
  - [ ] Wizard generated an employee whose `execution_steps` reference `notion` via `execute.ts` and surfaced Notion as connected (curl response + `archetypes` row)
  - [ ] In the running container, `docker exec <employee-container> ls /app/.opencode/skills/` shows `composio-notion` and does NOT show any non-connected `composio-*` app
  - [ ] Task reaches `Done` (or `Reviewing`→approved→`Done`) — full `task_status_log` trace captured
  - [ ] The container log shows the employee actually invoked `execute.ts --toolkit notion --action <SLUG>` (grep the task log)
  - [ ] A `task_composio_calls` row exists for this task with `toolkit='notion'`, the action slug, and a non-null `phase` (verified via **psql**, zero rows = failure)
  - [ ] `GET /admin/tenants/.../composio/usage` returns non-empty including this call
  - [ ] The delivery artifact landed (Slack message posted, or the configured deliverable) — captured via Slack UI/screenshot or DB
  - [ ] Throwaway employee soft-deleted after the run

  **QA Scenarios**:

  ```
  Scenario: Full live chain — wizard → trigger → skill filter → Composio call → audit → delivery
    Tool: Bash (curl + psql + docker) + interactive_bash (tmux for build/trigger) + Playwright (Slack)
    Preconditions: All Tasks 1–12 done; Docker image rebuilt; Notion connected for VLRE; services healthy
    Steps:
      1. Rebuild Docker image in tmux; wait for EXIT_CODE:0
      2. Create the Notion test employee via the wizard endpoint; assert response shows Notion CONNECTED and execution_steps reference `execute.ts --toolkit notion`; save the generated archetype slug
      3. Trigger the employee via the admin trigger endpoint; capture TASK_ID
      4. While Executing: docker ps --filter name=employee- ; docker exec <container> ls /app/.opencode/skills/ ; assert composio-notion present, a known-unconnected composio-* app absent
      5. Wait for terminal state; psql task_status_log for TASK_ID — assert full trace to Done
      6. grep the task log (/tmp/employee-<prefix>.log) for "execute.ts --toolkit notion" — assert the call happened
      7. psql: SELECT toolkit, tool_name, phase FROM task_composio_calls WHERE task_id='<TASK_ID>' — assert exactly the expected row(s), phase non-null
      8. curl GET /admin/tenants/00000000-0000-0000-0000-000000000003/composio/usage — assert non-empty including notion
      9. Verify delivery: open the target Slack channel (Playwright/CDP) or query the delivered artifact — assert the employee's output is present
      10. Soft-delete the throwaway employee
    Expected Result: every checkpoint passes; documented evidence for each
    Failure Indicators: empty task_composio_calls (audit broken); composio-notion missing in container (skill ship/filter broken); unconnected composio-* present (filter broken); no execute.ts call in log (employee unaware of tool); usage endpoint empty (audit/endpoint broken)
    Evidence: .sisyphus/evidence/task-13-live-e2e/  (task-id.txt, status-log.txt, container-skills.txt, task-log-grep.txt, audit-row.txt, usage.json, delivery-screenshot.png)

  Scenario: Cache-miss fallback — employee uses live discovery for an app without a pre-shipped skill
    Tool: Bash (curl + docker) + psql
    Preconditions: Identify or temporarily mark a connected app that has NO committed skill folder (or temporarily remove one app's committed skill before the rebuild) so the boot filter leaves it without a skill
    Steps:
      1. Trigger an employee for that app
      2. Confirm no composio-<that-app> skill folder is in the container
      3. grep the task log for a list-actions.ts invocation — assert the employee discovered actions live
      4. Confirm the employee still completed the action (audit row written)
    Expected Result: employee falls back to list-actions.ts and still succeeds — proves the safety net
    Evidence: .sisyphus/evidence/task-13-live-e2e/cache-miss-fallback.txt
  ```

  **Commit**: NO (verification only — no source changes; evidence committed under .sisyphus/)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> Runs AFTER Task 13's live E2E has passed. 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Never mark F1–F6 checked before the user's okay. If Task 13 (live E2E) has not passed, this wave cannot start.

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Never mark F1–F4 checked before the user's okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command, psql query). For each "Must NOT Have": search the codebase for forbidden patterns (DB cache table, cron registration, S3/storage layer, hardcoded skill names in instructions, full action catalogs in AGENTS.md) — reject with file:line if found. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log in prod paths, AI slop (over-abstraction, generic names). Verify shell tools use `requireEnv`/`optionalEnv` and `unescapeShellArg`.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Live E2E Evidence Audit** — `unspecified-high` (+ `e2e-testing`)
      The live end-to-end run is Task 13 (the capstone). F3 does NOT re-run it — it AUDITS Task 13's evidence in `.sisyphus/evidence/task-13-live-e2e/` for sufficiency: confirm a real task ID, a `task_status_log` trace to `Done`, in-container skill-filtering proof, a `task_composio_calls` audit row (via psql, not just the saved file), a non-empty `/composio/usage` response, the `execute.ts --toolkit notion` log line, and a delivery artifact. If any evidence is missing or stale, REJECT and require Task 13 be re-run. Re-verify the audit row live with a fresh psql query.
      Output: `Evidence complete [Y/N] | Audit row live-verified [Y/N] | Delivery confirmed [Y/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — everything specced was built, nothing beyond spec. Confirm no cron/timer/DB-cache/storage-layer crept in. Confirm `execute.ts` is the only shell tool granted PostgREST write.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [ ] F5. **Documentation Freshness** — update AGENTS.md (new shell tool `list-actions.ts`, `phase` column, Composio skill system, corrected PostgREST claim) and README if needed. Per AGENTS.md Documentation Freshness rule.

- [ ] F6. **Tmux cleanup** — kill all `ai-*` tmux sessions created during execution.

- [ ] F7. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

## Commit Strategy

One commit per task (or per tightly-coupled pair). Conventional commits. Never `--no-verify`. No AI/Co-authored-by references.

## Success Criteria

### Verification Commands

```bash
pnpm build                                  # Expected: clean
pnpm lint                                   # Expected: clean
pnpm test:unit                              # Expected: 0 failures
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d task_composio_calls"   # Expected: phase column present
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Task 13 live E2E passed: a real employee triggered, used Notion via Composio in-container, wrote a `task_composio_calls` audit row, and delivered its output — all documented with evidence
