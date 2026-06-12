# Learnings — composio-employee-awareness

## [2026-06-12] Plan Start

### Key Architecture Facts

- `COMPOSIO_API_KEY` already in `PLATFORM_ENV_WHITELIST` (tenant-env-loader.ts:14) → reaches execution AND delivery containers
- `agents-md-compiler.mts` `loadConnectedToolkits()` injects "Connected Apps" section at runtime (toolkit names only)
- Harness boot order: `writeOpencodeAuth` → `loadConnectedToolkits` → write `/app/AGENTS.md` → `runOpencodeSession`/`startOpencodeServer`
- Filtering slots in AFTER `loadConnectedToolkits`, BEFORE server start
- `/app/.opencode/skills/` is writable at container runtime
- OpenCode skills scanned ONCE at startup — NO hot reload
- Composio execute response: NO `log_id` (fixture: `data.markdown` + `data.successful` only)
- Composio API: `GET /api/v3.1/tools?toolkit_slug=<x>` lists actions WITH `input_parameters` JSON schemas
- Both seeded tenants (`...0002` DozalDevs and `...0003` VLRE) already have **Notion connected** in `composio_connections`

### Key File Locations

- `src/gateway/routes/composio-catalog.ts` — connectable set logic (authConfigs.list())
- `src/repositories/composio-connection-repository.ts` — getActiveConnections(tenantId)
- `src/workers/lib/agents-md-compiler.mts` — loadConnectedToolkits() pattern
- `src/worker-tools/composio/execute.ts` — sibling tool for list-actions.ts
- `src/workers/lib/execution-phase.mts` — insertion point ~line 176
- `src/workers/lib/delivery-phase.mts` — insertion point ~line 93
- `src/workers/lib/harness-helpers.mts` — existing skills-dir read at ~line 264
- `src/inngest/lifecycle/lib/machine-provisioner.ts` — critical vars manifest

### Constraints

- NO cron/timer/background jobs
- NO DB cache table for skills
- NO per-task skill generation
- NO full action catalogs in AGENTS.md
- NO blanket PostgREST access (only execute.ts)
- NO skill names hardcoded in instructions
- NO reliance on Composio log_id
- CI checks freshness, NEVER mutates

## Task 1 — Add phase column to task_composio_calls (2026-06-11)

- `prisma migrate dev` fails with shadow DB error (P3006/P1014) when the shadow DB doesn't have `_prisma_migrations`. Workaround: create migration SQL manually in `prisma/migrations/<timestamp>_<name>/migration.sql`, then run `prisma migrate deploy`.
- Migration naming: `<YYYYMMDDHHmmss>_<snake_case_description>` — get timestamp with `date "+%Y%m%d%H%M%S"`.
- PostgREST endpoint is at `http://localhost:54331/rest/v1/<table>` (not `http://localhost:54331/<table>` — the `/rest/v1/` prefix is required via Kong).
- After migration + `NOTIFY pgrst, 'reload schema'`, PostgREST immediately returns `[]` for `?select=phase&limit=0` — confirms column visible.
- `phase String?` added as nullable TEXT column to `task_composio_calls`. Values: `'execution'` | `'delivery'`.

## Task 4 — Extract getConnectableToolkits() (2026-06-12)

- Created `src/lib/composio/connectable-apps.ts` — standalone module exporting `getConnectableToolkits(): Promise<Set<string>>`
- Logic extracted from `composio-catalog.ts` lines 171-186 (the `connectableCache` refresh block)
- The Composio SDK `authConfigs.list()` returns `{ items: Array<{ toolkit?: { slug?: string } }> }`
- Slugs must be lowercased (`.toLowerCase()`) — the SDK may return mixed case
- Items with null/missing `toolkit` or `toolkit.slug` are silently skipped
- When `COMPOSIO_API_KEY` is empty string, function returns empty Set without calling SDK
- `COMPOSIO_API_KEY()` from `src/lib/config.ts` returns `''` (not undefined) when unset
- Test file location: `tests/unit/lib/composio/connectable-apps.test.ts` (vitest include pattern: `tests/unit/**/*.test.ts`)
- Vitest config does NOT include `src/lib/**/*.test.ts` — tests must go in `tests/unit/` or `src/**/__tests__/`
- Build passes: `pnpm build` exits 0 with new module
- The `(ac as { toolkit?: { slug?: string } })` cast is needed because Composio SDK types don't expose `toolkit.slug` directly on auth config items

## Task 3 — Add list-actions.ts shell tool (2026-06-12)

- Task spec said helpers live in `src/worker-tools/lib/env.ts` — INACCURATE. The real path is `src/worker-tools/lib/require-env.ts` (exports `requireEnv` + `optionalEnv`). The sibling `execute.ts` imports `../lib/require-env.js`, `../lib/get-arg.js`, `../lib/unescape-args.js`. Always mirror the sibling, not the task prose.
- Fixtures dir convention is `__fixtures__/` (double-underscore), NOT `fixtures/` as the `adding-shell-tools` skill text says. The real composio dir uses `__fixtures__/execute.json`. Match the actual sibling.
- Live Composio LIST endpoint base: `https://backend.composio.tech/api/v3.1/tools` (note `.tech`). The sibling `execute.ts` EXECUTE endpoint uses `https://backend.composio.dev/...` (`.dev`). Different hosts per endpoint — copy from the task spec, not blindly from the sibling URL.
- DELIBERATE ORDER DEVIATION from execute.ts: execute.ts checks `--mock` BEFORE arg validation. list-actions.ts must validate `--toolkit` FIRST so `--mock` with no `--toolkit` exits 1. Documented this with an inline comment (justified: prevents a future reader "fixing" it back).
- Composio tools list response shape: `{ items: [{ slug, name, description, input_parameters }] }`. Mapped to a compact `ActionSummary[]` array on stdout.
- `import.meta.url` in worker-tools triggers `tsc` error TS1470 under the root `tsconfig.json` (CommonJS output mode) — this is a FALSE POSITIVE. The already-shipped `execute.ts` emits the identical TS1470. Worker-tools run via `tsx` (native ESM), are not part of the root `tsc` build, and tsconfig only excludes `node_modules/dist/supabase`. Do NOT try to "fix" import.meta in worker-tools.
- LSP `typescript-language-server` times out in `src/worker-tools/` (no version in `.tool-versions`) — rely on runtime `tsx` execution as the real verification for shell tools.
- All 3 QA scenarios pass: `--help`→exit 0+usage; `--mock --toolkit notion`→exit 0+JSON array (4 actions); `--mock` alone→exit 1+`Error: --toolkit is required` on stderr.

## Task 2 — skill-generator.ts module (2026-06-12)

- Test file location: `tests/unit/lib/composio/skill-generator.test.ts` — NOT co-located in `src/lib/composio/`. The vitest include pattern is `tests/unit/**/*.test.ts` and `src/**/__tests__/**/*.test.ts`. Co-located tests at `src/lib/composio/*.test.ts` are NOT picked up.
- JSON fixture imports under `module: NodeNext` require `with { type: 'json' }` import attribute: `import foo from './foo.json' with { type: 'json' }`. Without it, tsc emits an error.
- `COMPOSIO_API_KEY` from `src/lib/config.ts` is a function `(): string` — mock it as `vi.fn(() => 'test-key')` in tests.
- `global.fetch` mocking works for `createHttpClient`-based calls — no need to mock the whole http-client module.
- Pagination: Composio API returns `{ items: [...], next_cursor: string | null }`. Loop until `next_cursor` is null, passing `cursor=<value>` as query param on subsequent requests.
- Slug sanitization: replace all non-`[a-z0-9-]` chars with `-`, collapse consecutive hyphens, strip leading/trailing hyphens. Underscores → hyphens.
- SKILL.md frontmatter: `name` must match `^[a-z0-9]+(-[a-z0-9]+)*$`; `description` must be ≤1024 chars.
- Empty toolkit (zero actions): return valid `skillMd` with `_No actions available for this toolkit._` note and empty `actionFiles` — do NOT throw.
- `httpOverride` optional param on `generateComposioSkill` allows injecting a mock HTTP client in tests without mocking the whole module.
- `pnpm build` exits 0 with the new module (tsconfig.build.json excludes `**/*.test.ts`).
- Evidence saved to `.sisyphus/evidence/task-2-generator.txt`.

## Task 8 — Document list-actions.ts in agents.md (2026-06-12)

- Added "## Discovering Composio Actions" section to `src/workers/config/agents.md` (platform base config)
- Section is 5 lines: trigger condition, CLI usage, output shape, and link to execute.ts slug usage
- Placed AFTER the existing 4 platform rules — no duplication of the runtime-injected "Connected Apps" section
- Generic language only — no employee-specific or tenant-specific references
- Evidence saved to `.sisyphus/evidence/task-8-doc.txt`

## Task 7 — Audit row write in composio/execute.ts (2026-06-12)

- Added `writeAuditRow(toolkit, action)` helper + a call to it on the success path, immediately BEFORE `console.log(JSON.stringify(body))` (so the audit happens after `response.ok` is confirmed but the Composio result still prints).
- The helper is fully fire-and-forget: reads `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TASK_ID`, `TASK_TENANT_ID`, `TASK_PHASE` via `optionalEnv`; if any of the first four are missing it writes a stderr warning and `return`s (skips the write) — never exits. The whole fetch is wrapped in try/catch; both a non-2xx response and a thrown error only emit a stderr `Warning:` line.
- POST goes to `${SUPABASE_URL}/rest/v1/task_composio_calls` with raw headers `{ apikey, Authorization: Bearer, Content-Type, Prefer: return=minimal }` — NOT `makePostgrestHeaders` (that's a gateway/inngest module; worker tools use raw fetch, per the data-access boundary).
- Body keys match the Prisma `TaskComposioCall` columns exactly: `id` (`randomUUID()` from `node:crypto`), `task_id`, `tenant_id`, `toolkit`, `tool_name` (= the `--action` slug), `phase` (`TASK_PHASE` or `null`), `called_at` (ISO now).
- `randomUUID` imported from `node:crypto` — PostgREST/Prisma `@default(uuid())` would also fill it, but supplying it client-side keeps `Prefer: return=minimal` simple and avoids relying on the default.
- `TASK_PHASE` is a NEW env var (values `'execution'` | `'delivery'`); not yet injected by the harness anywhere, so `?? null` is the expected real-world path until a later task wires it in.
- `optionalEnv` (graceful) and `requireEnv` (exits) both live in `src/worker-tools/lib/require-env.js` — the existing `requireEnv` import was widened to `{ optionalEnv, requireEnv }`.
- `pnpm build` (`tsc -p tsconfig.build.json`) exits 0; no `error TS` referencing execute.ts. The pre-existing `import.meta.url` TS1470 false-positive is unaffected (worker-tools aren't in the tsc build).
- Evidence: `.sisyphus/evidence/task-7-audit-row.txt` (success path + POST body) and `.sisyphus/evidence/task-7-resilient.txt` (optionalEnv guards + try/catch).

## Task 5 — generate-composio-skills.ts script (2026-06-11)

- Composio API base URL: `skill-generator.ts` hardcodes `https://backend.composio.tech` — this host does NOT resolve. The correct URL is `https://backend.composio.dev` (matches SDK's `DEFAULT_BASE_URL`). Workaround: the script injects an `httpOverride` via the `generateComposioSkill(slug, httpOverride)` optional param, pointing at `backend.composio.dev`. Do NOT use `.tech` for new code.
- `skill-generator.ts` bug fixed (Task 5 scope): `schema.description` in real API responses can be non-string (object/null); added `typeof schema.description === 'string'` guard before calling `.replace()`. Without this, notion/slack/slackbot all fail with `TypeError: (...).replace is not a function`.
- `getConnectableToolkits()` via Composio SDK successfully returns auth-configured apps from environment: found `gmail, notion, slack, slackbot` (4 apps).
- Idempotency: second run produces 0 written, 357 unchanged — `git diff src/workers/skills/` is empty. The `writeIfChanged` helper reads existing file and compares; skips the write if content matches.
- Action counts: gmail=63, notion=48, slack=154, slackbot=88 (357 action files total + 4 SKILL.md = 361 files).
- Determinism: slugs sorted alphabetically before iteration; `Object.entries(actionFiles).sort(([a],[b]) => a.localeCompare(b))` ensures consistent action file ordering.
- dotenv loading: script uses `createRequire(import.meta.url)` to `require('dotenv')` inside a try/catch — graceful if dotenv is unavailable, but in this repo it's always present.
- `tsx scripts/generate-composio-skills.ts` resolves imports relative to the script file; `import '../src/lib/config.js'` works because tsx handles the `.js`→`.ts` extension mapping at runtime.

## Task 6 — filterComposioSkills() in harness-helpers.mts (2026-06-12)

- Added `export function filterComposioSkills(connectedToolkits: string[]): void` to `harness-helpers.mts`. SYNCHRONOUS (uses `readdirSync`/`rmSync` from `node:fs`) — no `await` at the call sites.
- Boot-order verification (the critical insight): `startOpencodeServer()` is NOT called in either phase file directly. It's called INSIDE `runOpencodeSession` (the injected fn) at `opencode-harness.mts:71`. Both phases invoke `runOpencodeSession` AFTER their `loadConnectedToolkits()` call (execution-phase ~line 238, delivery-phase ~line 144). So inserting `filterComposioSkills(connectedToolkits)` right after `loadConnectedToolkits()` reliably lands before the server boots & scans skills. The MUST-NOT "do not run after server started" is satisfied.
- Skills dir constant: extracted the hardcoded `/app/.opencode/skills` (was inline at the old skills-log read) into a module-level `const SKILLS_DIR` and reused it in `writeOpencodeAuth`'s existing skills-log block — DRY, single source of truth for the path.
- App-slug extraction: folder `composio-notion` → slug `notion` via `name.slice('composio-'.length).toLowerCase()`. Connected set is also `.toLowerCase()`'d — DB toolkit slugs vs folder slugs may differ in case (same lesson as Task 4's connectable-apps lowercasing).
- Non-Composio skills are explicitly skipped (`if (!name.startsWith('composio-')) continue;`) — only `composio-*` folders are ever candidates for deletion.
- Resilience: a missing `/app/.opencode/skills` dir → `readdirSync` throws → caught → logs + early `return` (no-op, no throw). A per-folder `rmSync` failure is caught per-entry, logged `warn`, and the loop continues (doesn't abort the whole prune).
- `rmSync(..., { recursive: true, force: true })` is the sync equivalent of `rm -rf` — the task said "`rm -rf` the folder"; used the native fs API instead of shelling out (no new deps, no child_process).
- Logs `{ connectedToolkits, kept, removed }` in one structured `log.info` — mirrors the existing `log.info({ skills }, ...)` pattern in harness-helpers.
- These are `.mts` ESM files — used top-of-file `import { readdirSync, rmSync, type Dirent } from 'node:fs'` (NOT dynamic `await import`). `Dirent` type needed for the `entries` array annotation.
- `pnpm build` (`tsc -p tsconfig.build.json`) exits 0. LSP (`typescript-language-server`) unavailable in this repo (no version in `.tool-versions`) — build is the real verification, consistent with prior tasks.
- Evidence: `.sisyphus/evidence/task-6-filter.txt` (grep of all 6 `filterComposioSkills` references across the 3 files + build EXIT_CODE:0).

## Task 9 — Wizard Composio awareness (2026-06-12)

- Three files modified: `admin-archetype-generate.ts`, `archetype-generator.ts`, `archetype-generator-prompts.ts`
- `buildConnectedAppsBlock(connectedToolkits, connectableToolkits)` added to prompts file — self-contained, computes `suggestedToolkits` internally for the prompt text
- `buildSystemPrompt()` now takes `(connectedToolkits: string[] = [], connectableToolkits: string[] = [])` and injects the Connected Apps block between SYSTEM_PROMPT_PRE and the tool catalog section
- `generate()` signature widened: third optional param `composioContext?: { connectedToolkits?: string[]; connectableToolkits?: string[] }` — backward-compatible (defaults to empty arrays)
- Route: `ComposioConnectionRepository` + `getConnectableToolkits()` called in the handler. `getConnectableToolkits()` is wrapped in its own try/catch so a Composio API failure does NOT block archetype generation.
- Route response: `{ ...result, connectedToolkits, suggestedToolkits }` — Composio metadata merged into the JSON response alongside archetype fields
- `suggestedToolkits` = `connectableToolkits.filter(t => !connectedToolkits.includes(t))` — computed in both the route (for the response) and in the prompt builder (for the LLM instruction)
- `refine()` path intentionally does NOT pass composio context — the route was not updated for refine because the task spec only requires the `generate` path, and refine is a re-edit of an existing archetype where context would already have been applied at initial generation
- `COMPOSIO_API_KEY()` is called inside `getConnectableToolkits()` — no direct env access in the route
- Verified: VLRE tenant (notion connected) → `connectedToolkits: ["notion"]`, `suggestedToolkits: ["slackbot","slack","gmail"]`, no composio execute.ts in execution_steps
- Verified: VLRE with notion soft-deleted → `connectedToolkits: []`, all 4 apps in `suggestedToolkits`, no composio execute.ts calls
- `pnpm build` exits 0
- Evidence: `.sisyphus/evidence/task-9-wizard.txt`, `.sisyphus/evidence/task-9-none.txt`

## Task 11 — COMPOSIO_API_KEY in critical-vars manifest (2026-06-11)

- Added `'COMPOSIO_API_KEY'` to BOTH `localCriticalVars` (line ~209) and `flyCriticalVars` (line ~263) in `machine-provisioner.ts`.
- The `.filter((k) => localWorkerEnv[k])` / `.filter((k) => flyWorkerEnv[k])` guards mean the key only appears in `PLATFORM_ENV_MANIFEST` when it is actually present in the env — no false positives when the key is absent.
- This is observability only — the key already reaches containers via `PLATFORM_ENV_WHITELIST` in `tenant-env-loader.ts`. The manifest is used for debug logging, not injection.
- `pnpm build` exits 0.
- Evidence: `.sisyphus/evidence/task-11-manifest.txt` (two matching grep lines, one per array).

## Task 12 — Documentation audit: fix false PostgREST claim and non-existent column (2026-06-11)

### False claims found and fixed in AGENTS.md

**Claim 1 — Non-existent column `composio_connection_id`:**

- AGENTS.md listed `composio_connection_id` as a column in `composio_connections`
- Prisma schema (`ComposioConnection` model) has NO such column
- Actual columns: `id, tenant_id, toolkit, status, connected_at, disconnected_at, deleted_at, created_at, updated_at`
- Fix: replaced the column list with the accurate set from the schema

**Claim 2 — "Currently unpopulated (shell tools have no PostgREST access)":**

- AGENTS.md said `task_composio_calls` was unpopulated because shell tools lack PostgREST access
- This was doubly wrong: (a) `execute.ts` now writes audit rows via PostgREST (Task 7), (b) `knowledge_base/search.ts` also reads via PostgREST
- Also: AGENTS.md omitted the `phase` column added in Task 1
- Fix: updated to "Written by `execute.ts` via PostgREST on the success path; `phase` is `'execution'` or `'delivery'`"

### Verification

- `grep -n "composio_connection_id" AGENTS.md` → 0 matches
- `grep -n "no PostgREST access\|unpopulated" AGENTS.md` → 0 matches
- Evidence: `.sisyphus/evidence/task-12-docs.txt`

## [2026-06-12] Task 10 — CI freshness-check for Composio skills

### What was added

- New step in the **existing `test` job** of `.github/workflows/deploy.yml` (NOT a new job): "Check Composio skills freshness"
- Runs `pnpm generate-composio-skills` then `git diff --exit-code src/workers/skills/`; explicit `exit 1` + `::error::` annotation on drift
- `env: COMPOSIO_API_KEY: ${{ secrets.COMPOSIO_API_KEY }}` on the step. Read-only — no git add/commit/push.

### CRITICAL gotcha — local simulation mechanism (cost me one bad run)

- `tsx` auto-loads `.env` (via the script's `dotenv` try/catch — but even without the pkg, **tsx itself injects `.env`**), so locally `COMPOSIO_API_KEY` IS present → the generator calls the LIVE Composio API and `writeIfChanged` **self-heals the working tree**, overwriting any plain unstaged hand-edit. A naive "edit file → run check" therefore shows CLEAN (false negative).
- The check's real baseline is the **git index**. In CI a fresh checkout loads the index from the (stale) commit, so regen→canonical working tree ≠ stale index → fails.
- Faithful local repro of "committed-but-stale": hand-edit the action file **then `git add` it** (index = stale-commit proxy), then run the exact check command. Regen restores canonical to the working tree; `git diff` (worktree vs stale index) is non-empty → exit 1. ✓
- Fresh repro: `git restore --staged --worktree src/workers/skills/` then run check → "0 written, 357 unchanged", diff clean → exit 0. ✓

### Graceful-no-op caveat

- `COMPOSIO_API_KEY()` returns `''` when unset → generator exits 0 with a warning. So if the CI secret is missing, the step PASSES (cannot detect drift without the API). Documented inline in the step comment. This is the accepted/inherited behavior.

### Verification

- Evidence: `.sisyphus/evidence/task-10-stale.txt` (exit 1), `.sisyphus/evidence/task-10-fresh.txt` (exit 0)
- `deploy.yml` validated: prettier parse clean ("All matched files use Prettier code style!") + 8 pure-node structural assertions all PASS
- Working tree restored clean (`git status --short src/workers/skills/` empty); only `.github/workflows/deploy.yml` touched by this task

## Task 13 — Live E2E Verification (2026-06-12)

### Confirmed working end-to-end
- **Docker image** bakes in all 4 `composio-*` skill folders (gmail, notion, slack, slackbot) via `COPY src/workers/skills/`.
- **`filterComposioSkills()`** runs at container boot in BOTH execution-phase.mts AND delivery-phase.mts. For VLRE (only notion connected) it kept `composio-notion`, removed `composio-gmail`/`composio-slack`/`composio-slackbot`. Verified via runtime log line `Composio skill folders filtered` with `kept`/`removed` arrays.
- **Wizard generate endpoint** (`POST /admin/tenants/:id/archetypes/generate`) returns `connectedToolkits` + `suggestedToolkits` and bakes `tsx /tools/composio/execute.ts --toolkit notion --action NOTION_SEARCH …` into `execution_steps`.
- **`execute.ts` audit write** populates `task_composio_calls` (one row per Composio call). 4 rows written for the test task. NOTE: `phase` column was NULL — TASK_PHASE env var not injected yet (acceptable per plan).
- **`GET /composio/usage`** returns grouped counts: `[{"toolkit":"notion","date":"...","count":4}]`.

### Procedural notes for future E2E
- Create-archetype schema (`CreateArchetypeBodySchema`) has NO `vm_size` field — set `vm_size='performance-1x'` via psql AFTER create (required for opencode runtime or OOM).
- Build the create payload with `jq` from the generate response to avoid shell-escaping multi-line `instructions`/`execution_steps`. Override `model→deepseek/deepseek-v4-flash`, `risk_model.approval_required→false`, unique kebab `role_name`.
- `python3` is intercepted by asdf (no version set) — use `jq` for JSON parsing in this repo, not `python3 -c`.
- Task log persists at `/tmp/employee-{taskId:0:8}.log`; delivery log at `/tmp/employee-delivery-{taskId:0:8}.log`.
- Soft-delete archetype: `UPDATE archetypes SET deleted_at=NOW(), status='draft'` — trigger endpoint then returns 404 (confirmed isolation).
- Real delivery proof: query Slack `conversations.replies` with `metadata->>'notify_slack_ts'` as the thread root; the delivered content is a thread reply under the "Task complete" message.
- deepseek-v4-flash reliably called bash + composio tools (model routed through opencode-go).
