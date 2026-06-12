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
