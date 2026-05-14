
## 2026-05-14 — tool-parser.ts creation (Tasks 1+2)

### File patterns confirmed
- **Pattern A** (parseArgs + indexOf): create-passcode.ts, list-passcodes.ts, hostfully tools
- **Pattern B** (args.includes): list-locks.ts — detects boolean flags only
- **Pattern C** (for-loop + args[i] ===): knowledge_base/search.ts, post-message.ts, slack tools

### Description extraction gotchas
- JSDoc `/** ... * <desc>` → first `*` content line — reliable for sifely/knowledge_base tools
- Array `.join('\n')` pattern → extract from array content → works for sifely tools with JSDoc anyway
- String concatenation help (post-message.ts) — has NO description line in help text, falls back to `name`
- `post-message.ts` description = `"post-message"` (name fallback) — no JSDoc, no description paragraph

### Required flag detection
- Looks for `process.stderr.write` containing flag name + `process.exit(1)` within 300 chars
- Works well for sifely tools (explicit "Error: --flag-name is required" messages)

### discoverTools
- Returns 24 tools (hostfully:10, knowledge_base:1, platform:1, sifely:9, slack:3)
- `sifely/lib/api.ts` correctly excluded by `/lib/` path filter
- `hostfully/fixtures/` excluded by `/fixtures/` path filter

### parseSkillMd
- Uses `### \`` separator to split sections
- Returns 13 entries for tool-usage-reference/SKILL.md
- Returns empty Map for missing files without throwing

### Build
- `pnpm build` (tsc -p tsconfig.build.json) — exits 0
- Node.js `dirent.parentPath` vs `dirent.path` — handled with type-cast compatibility shim
