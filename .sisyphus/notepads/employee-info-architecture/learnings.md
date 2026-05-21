## Task 2 — tool-reference-generator.mts

- `getToolByPath(basePath, service, toolName)` from `tool-parser.ts` returns `null` on any error — safe to call with nonexistent paths
- Container paths `/tools/service/name.ts` → strip `/tools/` prefix, split on `/` → service + toolName
- Import `.mts` files in Vitest tests using `.mjs` extension (ESM convention)
- `submit-output.ts` JSDoc first line is "submit-output.ts" (filename) so `description` from parser = "submit-output.ts" — acceptable since we don't hardcode
- `vitest run <file>` works correctly; avoid interactive watch mode in tmux sessions
- Evidence dir `.sisyphus/evidence/` is gitignored — no need to force-add

## Task 4 — Harness Wiring

- Both generators integrate cleanly into the platformRuntimeSections block in `main()` (async function — `await` works)
- `ArchetypeRow` interface in harness does NOT auto-reflect DB schema — must manually add fields when new archetype columns are read
- Insertion point: after legacy system_prompt push, before the `try` block that calls `resolveAgentsMd`
- Type cast pattern for optional JSONB fields: `(archetype.field as { key?: type } | null)?.key ?? default`
- `pnpm test --run` ran 1508 tests, 27 skipped, 0 failures — new generator tests from Wave 1 are included in the count
- `.mts` → `.mjs` import extension required in all ESM harness imports
