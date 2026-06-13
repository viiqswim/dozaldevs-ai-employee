# Learnings — custom-integration-skills

## [2026-06-13] Session Start

### Architecture (verified pre-plan)

- `tool-usage-reference/SKILL.md` is a GENERATED+hand-written hybrid. Sentinel at line ~335: `<!-- HAND-WRITTEN: DO NOT GENERATE BELOW -->`. Above = auto-generated from `ALL_TOOL_DESCRIPTORS` via `scripts/generate-tool-usage-skill.ts`. Below = 5 tribal warnings + detailed per-service docs (stale Sifely paths here).
- `discoverTools()` in `src/gateway/services/tool-parser.ts` maps `ALL_TOOL_DESCRIPTORS` (static, startup-cached). No `fs.readdir`. No leaks.
- `ALL_TOOL_DESCRIPTORS` in `src/lib/tool-registry.ts` is a MANUALLY maintained static array. Adding a tool = update both the tool file AND `tool-registry.ts`.
- `enforce_tool_registry Boolean @default(false)` in schema.prisma. `isToolAllowed()` at `execution-phase.mts:74-84`. Default = no-op.
- `admin-brain-preview.ts:332` skills list already uses `getWorkerSkills()`. BUT both `admin-tools.ts` (20,30,54) AND `admin-brain-preview.ts` (304-309) STILL call `parseSkillMd(tool-usage-reference/SKILL.md)` for tool enrichment.
- `refine()` at `archetype-generator.ts:361-394` uses static `REFINE_SYSTEM_PROMPT` — blind to tool catalog and composio context.
- Stale Sifely paths: generated section is correct (`sifely/...`). Hand-written section below sentinel still has `/tools/locks/sifely-client.ts` paths.

### Tenant Detection Signals (verified)

- Hostfully: any `tenant_secrets.key` matching `hostfully_*`
- Sifely: any `tenant_secrets.key` matching `sifely_*` (3 keys: sifely_client_id, sifely_username, sifely_password)
- Slack: `tenant_secrets.key = 'slack_bot_token'` ONLY (Composio-Slack is DISABLED)
- GitHub: `tenant_integrations` provider=github AND deleted_at IS NULL OR `tenant_secrets.key = 'github_installation_id'`

### Key Constraints

- NEVER delete `tool-usage-reference/SKILL.md`
- NEVER edit `filterComposioSkills`, Composio generator, `composio-*` folders, or `generate-tool-usage-skill` behavior
- NEVER add Slack-via-Composio detection branch
- NEVER use prefix-match filtering (explicit allowlist only)
- NEVER rename `/tools/knowledge_base/` dir (snake_case intentional, matches container path)
- always-keep set: `knowledge-base`, `platform` (+ existing `tool-usage-reference`/`uuid-disambiguation` untouched)
- `serviceToSkillName('knowledge_base')` → `'knowledge-base'` (only mapping needed)

### Wave 1 Tasks (parallel, independent)

- T1: Fix `refine()` blindness — inject tool catalog + composio context
- T2: Derive tool invocation paths from registry + strip stale hand-typed paths
- T3: Decouple `admin-tools.ts` + `admin-brain-preview.ts` tool-enrichment from `parseSkillMd(monolith)`

## [2026-06-13] Task 1 Complete — refine() blindness fix

### What was done

Split `REFINE_SYSTEM_PROMPT` in `archetype-generator-prompts.ts` into `REFINE_SYSTEM_PROMPT_PRE` +
`REFINE_SYSTEM_PROMPT_POST`. Added `buildRefineSystemPrompt(connectedToolkits, connectableToolkits)`
in `archetype-generator.ts` — exact mirror of `buildSystemPrompt()`. Updated `refine()` to accept
`composioContext` optional param and call the new builder. Updated call site in
`admin-archetype-generate.ts` to pass `{ connectedToolkits, connectableToolkits }`.
Updated golden test to use fallback-path construction; regenerated `refine-prompt.txt` fixture.

### Key patterns

- The "split PRE/POST and inject between" pattern is the standard for all LLM system prompts
  that need tool catalog + connected apps sections.
- Golden tests for fallback path replicate the function manually (no async mock needed):
  `PRE + '\n\n' + buildConnectedAppsBlock([], []) + '\n\n' + POST`
- `REFINE_SYSTEM_PROMPT` kept as `PRE + POST` concatenation for backward compat (if anything else
  imports it) — but the canonical path is `buildRefineSystemPrompt()`.

### Verification

- pnpm build: exit 0
- pnpm test:unit: 154 files, 1786 passed, 9 skipped, 0 failures
- Commit: b8fb660c

## [2026-06-13] Task 2 Complete — derive tool invocation paths from registry

### What was done

- Added `toolInvocationPath(descriptor: Pick<ToolDescriptor,'service'|'id'>): string` to
  `src/lib/tool-registry.ts` → returns `tsx /tools/<service>/<id>.ts`. THE shared path helper Task 4 reuses.
- `renderTool()` in `scripts/generate-tool-usage-skill.ts` now emits
  `**Invocation**: \`tsx /tools/<service>/<id>.ts [flags]\`` per tool (imports the shared helper).
- Exported `renderTool` + guarded `main()` with `if (import.meta.url === \`file://${process.argv[1]}\`)`
  (same pattern as trigger-task.ts:698) so tests can import it without the file-write side effect.
- Rewrote the hand-written zone of `tool-usage-reference/SKILL.md`: removed ALL `tsx /tools/...` code
  fences + the stale `/tools/locks/sifely-client.ts --action` monolith; converted Lock Tools section to
  `Sifely Lock Tools (/tools/sifely/)` with per-action subsections (`sifely/list-locks` etc.). Kept every
  JSON output-shape block, behavioral notes, exit codes, and all 5 tribal warnings. Quick Reference Table
  dropped its "Container Path" column (paths now single-sourced in generated section); rows rekeyed to
  `service/id`. Fixed frontmatter description `/tools/locks/` → `/tools/sifely/`.

### Key patterns / gotchas

- The generator's `buildContent()` reads frontmatter (regex `^---\n...---\n`) + hand-written (from sentinel
  to EOF) and regenerates ONLY the middle. So to fix frontmatter + hand-written zone: just `Write` the file
  with correct frontmatter + sentinel + new body, then run `pnpm generate-tool-usage-skill` — it rebuilds
  the generated middle. No need to hand-craft the generated section.
- Idempotency ≠ `git diff --exit-code` against HEAD pre-commit (that always diffs — file changed). The REAL
  idempotency test is: run generator twice, `diff` the two outputs → identical. Confirmed PASS.
- 30 descriptors → 30 `**Invocation**` lines (1:1). Grep assert `>= descriptor count`.
- Tests: `tests/unit/lib/tool-registry.test.ts` (5) + `tests/unit/scripts/generate-tool-usage-skill.test.ts` (3).

### Verification

- pnpm build: exit 0 · eslint changed files: exit 0 · full unit suite: 156 files, 1794 passed, 9 skipped, 0 fail
- grep `/tools/locks/|sifely-client`: NONE · no `tsx /tools/` below sentinel · generator idempotent
- Evidence: .sisyphus/evidence/custom-skills/task-2-{paths,derive,generator}.txt (gitignored)

## [2026-06-13] Task 3 Complete — decouple tool-enrichment from parseSkillMd(monolith)

### What was done

- `admin-tools.ts`: dropped `path`, `parseSkillMd`, `enrichTools`, `getToolByPath` imports + the
  module-level `basePath`/`skillPath` consts. Both routes now source from `discoverTools()` alone.
  `/admin/tools` → `sendSuccess(res, 200, { tools })`. `/admin/tools/:service/:toolName` →
  `discoverTools().find(t => t.service===s && t.name===name)`, 404 if absent. Note: the single-tool
  route NO LONGER disk-reads via `getToolByPath` — it filters the cached descriptor catalog, so it
  returns descriptor-shaped metadata (flags+envVars from descriptor, `sourceLength: 0`) identical to
  the list route. This is intentional and consistent.
- `admin-brain-preview.ts`: dropped `path` + `parseSkillMd`/`enrichTools` imports; replaced the
  basePath/skillPath/parseSkillMd/enrichTools block (~303-316) with
  `(await discoverTools()).map(t => ({name,service,description,containerPath}))`.
  `getWorkerSkills()` at the `skills:` field LEFT UNTOUCHED.

### Key patterns / gotchas

- `parseSkillMd`/`enrichTools`/`getToolByPath` were used ONLY in these 2 route files (plus their defn
  in `tool-parser.ts` which is OUT OF SCOPE — left intact for any future caller). Verified via grep.
- Dashboard `ToolMetadata` type (`dashboard/src/lib/types.ts:239`) has `notes?`/`example?`/`outputShape?`
  as OPTIONAL — dropping SKILL.md enrichment just omits those keys. Response shape contract preserved.
- LSP (typescript-language-server) is unavailable in this env (asdf `.tool-versions` gate, exit 126).
  Inline post-Edit diagnostics were STALE intermediate snapshots from parallel edits — `pnpm build`
  (tsc) is the authoritative type check. Don't trust mid-parallel-edit LSP errors.
- `python3` is also asdf-gated (exit on "No version set") — use `jq` for JSON inspection, not python.
- curl `-w "\nHTTP:%{http_code}"` + `sed` to strip it CORRUPTS multi-line JSON string fields → jq
  "control characters U+0000" parse error. Fix: fetch body to a file (`-o`) and get the code via a
  SEPARATE `curl -o /dev/null -w '%{http_code}'` call.

### Verification

- pnpm build: BUILD_EXIT:0 · pnpm test:unit --run: TEST_EXIT:0 (156 files, 1794 passed, 9 skipped, 0 fail)
- grep parseSkillMd in both files: zero (exit 1)
- LIVE (gateway :7700): GET /admin/tools → 200, 30 tools, all descriptions present.
  GET /admin/tools/slack/post-message → 200. GET .../does-not-exist → 404.
  brain-preview → 200, tools=30, skills=6 (unchanged).
- Evidence: .sisyphus/evidence/custom-skills/task-3-endpoints.txt

## [2026-06-13] Task 4 Complete — per-service skill generator

### What was done

- Created `src/lib/custom-skills/skill-generator.ts` with:
  - `serviceToSkillName(service)` — replaces `_` with `-`; `knowledge_base` → `knowledge-base`
  - `generateServiceSkill(service, descriptors)` — pure renderer returning `{ skillMd, actionFiles }`
  - `SERVICE_DESCRIPTIONS` map with ultra-specific per-service descriptions
  - Reuses `toolInvocationPath()` from `src/lib/tool-registry.ts` (NOT re-implemented)
- Created `tests/unit/lib/custom-skills/skill-generator.test.ts` with:
  - Uses REAL `ALL_TOOL_DESCRIPTORS` (not mocks)
  - 4 describe blocks: serviceToSkillName, hostfully, knowledge_base, pure-function contract
  - Asserts: invocation paths = `toolInvocationPath()`, no underscores in skill names, action files 1:1 with descriptors

### Key patterns / gotchas

- `toolInvocationPath()` returns `tsx /tools/<service>/<id>.ts` — the `knowledge_base` service maps
  to `tsx /tools/knowledge_base/search.ts` (underscore preserved in path, only skill folder name is kebab)
- SKILL.md format: YAML frontmatter (name + description) + `## Available Tools` table + reference to `actions/<tool-id>.md`
- Action file format: `# <id>` + Description + Invocation + Env vars + Arguments table
- `GeneratedServiceSkill` interface: `skillMd: string` + `actionFiles: Map<string, string>`
- Tests in `tests/unit/lib/custom-skills/` (new subdirectory)

### Verification

- pnpm build: exit 0
- pnpm test:unit --run: 157 files, 1810 passed, 9 skipped, 0 failures
- Evidence: .sisyphus/evidence/custom-skills/task-4-render.txt, task-4-naming.txt
