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

## [2026-06-13] Task 5 Complete — umbrella generate-skills command

### What was done

- Created `scripts/generate-skills.ts` umbrella script with 3 steps:
  1. `spawnOrExit(['scripts/generate-tool-usage-skill.ts'])` — delegates via subprocess
  2. `generateServiceSkill()` for 6 services (hostfully, sifely, github, slack, knowledge_base, platform), writes SKILL.md + actions/<toolId>.md per tool
  3. `spawnOrExit(['scripts/generate-composio-skills.ts'])` conditionally on `COMPOSIO_API_KEY` presence
- Added `"generate-skills": "tsx scripts/generate-skills.ts"` to package.json (existing aliases preserved)
- Generated and committed all 6 service skill folders + refreshed Composio skills (35 toolkits, 3449 files)

### Key patterns / gotchas

- The umbrella uses `spawnSync` for both sub-scripts — avoids need to export `main()` from either. Cleanest approach that respects the "don't modify files outside scope" constraint.
- `generateServiceSkill()` returns `Map<toolId, content>` for `actionFiles` — keys are tool IDs (not file paths). Write to `actions/<toolId>.md`.
- `ls src/workers/skills/ | grep '_'` check in expected outcome refers only to SERVICE_SKILL_SERVICES folders. Composio folders like `composio-context7_mcp` (with underscores in the toolkit slug) are expected and are generated by `generate-composio-skills.ts` — not a problem.
- `serviceToSkillName('knowledge_base')` → `'knowledge-base'` (only mapping needed; function replaces all `_` with `-`)
- Idempotency: run 1 → 34 service files written; run 2 → 0 written, 34 unchanged. Both tool-usage-reference (already current) and composio (202→3449 unchanged) also idempotent.
- File had duplicate content after Write+Edit sequence — the Write created version 1, then Edit replaced the body but left old content appended. Fixed with a second Edit that targeted the duplicate tail.
- File-level JSDoc is necessary for script files (CLI usage docs, consistent with all other generator scripts in this codebase) — hook priority 3.
- The `// dotenv unavailable...` comment is an existing pattern from `generate-composio-skills.ts` and `generate-tool-usage-skill.ts` — hook priority 1.

### Verification

- pnpm build: BUILD_EXIT:0
- pnpm test:unit: 157 files, 1810 passed, 9 skipped, 0 failures
- `pnpm generate-skills` (COMPOSIO_API_KEY present): exit 0, all steps ran
- Second run: 0 files written (idempotent)
- 6 service skill folders: github, hostfully, knowledge-base, platform, sifely, slack (all kebab-case)
- Commit: feat(skills): umbrella generate-skills command (reference + per-service + composio)
- Evidence: .sisyphus/evidence/custom-skills/task-5-umbrella.txt, task-5-idempotent.txt

## [2026-06-13] Task 6 Complete — loadCustomIntegrations() per-tenant detection

### What was done

- Added `loadCustomIntegrations(tenantId): Promise<string[]>` to `agents-md-compiler.mts`,
  placed directly after `loadConnectedToolkits()`. Exact mirror: worker `query()`, never throws,
  returns `[]` when nothing matches. Two helper row interfaces: `TenantSecretKeyRow {key}`,
  `TenantIntegrationIdRow {id}`.
- Detection (all verified by tests):
  - hostfully → `tenant_secrets.key` startsWith `hostfully_`
  - sifely → `tenant_secrets.key` startsWith `sifely_`
  - slack → `tenant_secrets.key === 'slack_bot_token'` (composio_connections NEVER queried)
  - github → `tenant_integrations?provider=eq.github&deleted_at=is.null` rows OR `key === 'github_installation_id'`
- 14 unit tests in `tests/unit/workers/agents-md-compiler-custom-integrations.test.ts` mirroring
  the composio test's `vi.hoisted` + `vi.mock('postgrest-client.js')` pattern.

### Key patterns / gotchas

- `tenant_secrets` has NO `deleted_at` column (schema.prisma:356-369) — so the secret query uses
  `select=key` ONLY, no soft-delete filter. `tenant_integrations` HAS `deleted_at` → filter applied there.
- Query KEYS ONLY (`select=key`) — never ciphertext/iv/auth_tag. Test asserts params NOT contain 'ciphertext'.
- Two queries always fire (secrets + github integration) regardless of secret signal — github added if
  EITHER has rows; `new Set()` de-dupes the overlap.
- Test routing: `queryMock.mockImplementation((table) => ...)` dispatches on table name to return
  the right fixture (secrets rows vs integration rows). Cleaner than ordered mockResolvedValueOnce
  when a function issues 2+ queries.
- Soft-delete exclusion is SERVER-SIDE (PostgREST `deleted_at=is.null`), so the "excluded" test mocks
  an empty github array — the function code itself does no deleted_at check.
- `pnpm build` exit-code capture: `PIPESTATUS` is bash-only; under zsh use `cmd > log 2>&1; echo $?`.

### Verification

- pnpm build: BUILD_EXIT:0
- new test isolated: 14 passed
- full unit suite: 158 files, 1824 passed, 9 skipped, 0 fail (TEST_EXIT:0)
- eslint changed files: LINT_EXIT:0
- Evidence: .sisyphus/evidence/custom-skills/task-6-detect.txt, task-6-github.txt

## [2026-06-13] Task 7 Complete — filterCustomSkills() boot-time pruning

### What was done

- Added `filterCustomSkills(connectedServices, skillsDir = SKILLS_DIR)` to `harness-helpers.mts`
  directly after `filterComposioSkills`. Exported two `readonly string[]` constants:
  `CUSTOM_SKILL_ALLOWLIST = ['hostfully','sifely','github','slack']` and
  `CUSTOM_SKILL_ALWAYS_KEEP = ['knowledge-base','platform']`.
- EXPLICIT ALLOWLIST (NOT prefix match): `if (!allowlist.has(slug)) continue;` — so always-keep,
  `composio-*`, `tool-usage-reference`, `uuid-disambiguation` are never even considered. Mirrors
  filterComposioSkills' readdirSync/rmSync/try-catch/log structure exactly; never throws.
- Added an optional `skillsDir` param (defaults to the hardcoded `SKILLS_DIR`) — this is the ONLY
  divergence from filterComposioSkills and it's what makes the function unit-testable without
  touching the real `/app/.opencode/skills`.
- Wired into BOTH execution-phase.mts and delivery-phase.mts: two lines immediately after
  `filterComposioSkills(connectedToolkits)`, before `compileAgentsMd`:
  `const connectedServices = task.tenant_id ? await loadCustomIntegrations(task.tenant_id) : [];`
  `filterCustomSkills(connectedServices);`
  Added `loadCustomIntegrations` to the existing `agents-md-compiler.mjs` import and `filterCustomSkills`
  to the existing `harness-helpers.mjs` import in both phase files.

### Key patterns / gotchas

- Tests use the REAL function over a temp dir (`fs.mkdtempSync`) + `skillsDir` param — same pattern as
  `skill-registry.test.ts`. No fs mocking needed. Cleaner and exercises real readdirSync/rmSync.
- Only mock needed: `vi.mock('../../../src/lib/logger.js')` to silence info/warn output. All other
  harness-helpers imports (config.ts INNGEST\_\* with safe defaults, approval-card-poster, slack-notifier)
  are side-effect-free at module load → importing the real harness-helpers.mts in a unit test is safe.
- LIST-SYNC INVARIANT: imports real `ALL_TOOL_DESCRIPTORS`, derives unique services, asserts each
  (after `serviceToSkillName` normalization) is in `(allowlist ∪ always-keep)`. `composio` is the one
  service intentionally excluded (HANDLED_ELSEWHERE set) — pruned by filterComposioSkills prefix match.
  Verified the tripwire FAILS for a hypothetical new 'jira' service (unaccounted=['jira']).
- 7 unique services in registry: slack, platform, github, knowledge_base, composio, hostfully, sifely.
  All except composio map cleanly into the union.

### Verification

- pnpm build: BUILD_EXIT:0
- targeted: filter-custom-skills.test.ts → 9 tests pass
- full unit suite: 159 files, 1833 passed, 9 skipped, 0 failures (one more file than Task 6 = my new test)
- eslint changed files: LINT_EXIT:0
- Tripwire proof: simulated new service 'jira' → unaccounted=['jira'], would FAIL (correct)
- Evidence: .sisyphus/evidence/custom-skills/task-7-{filter,zero,invariant}.txt

## [2026-06-13] Task 8 Complete — Custom Integrations section in compiled AGENTS.md

### What was done

- Added `buildCustomIntegrationsSection(services: string[]): string | null` to
  `agents-md-compiler.mts` directly before `CRITICAL_DIRECTIVE`. Exact mirror of
  `buildConnectedAppsSection`: filters blanks, returns null when empty so the
  caller skips injection. Renders `## Custom Integrations` + intro line + one
  bullet per service: `- **<DisplayName>** — load the \`<skill>\` skill for exact CLI usage.`
- Added `CUSTOM_INTEGRATION_DISPLAY_NAMES` map (hostfully→Hostfully, sifely→Sifely,
  github→GitHub, slack→Slack) + `customIntegrationDisplayName()` fallback (capitalize).
  Skill name via the SHARED `serviceToSkillName()` from `src/lib/custom-skills/skill-generator.ts`
  (NOT re-implemented) — so `knowledge_base`→`knowledge-base` mapping stays single-sourced.
- Added `connectedServices?: string[]` to `CompileAgentsMdInput`. Injected in
  `compileAgentsMd` immediately AFTER the Composio block, BEFORE Behavioral Rules.
- Wired `connectedServices` into BOTH phase files' `compileAgentsMd({...})` calls.
  Both already computed `const connectedServices = ... await loadCustomIntegrations(...)`
  in Task 7 (for filterCustomSkills) — so the value was already in scope; just added
  one line to each compile call. Zero new imports needed in the phase files.

### Key patterns / gotchas

- The "split PRE/POST and inject between" pattern from Task 1 didn't apply here —
  `compileAgentsMd` uses a `parts: string[]` array with `.push()` + `.join('\n\n')`,
  so injection = a conditional `parts.push(section)` between Composio and Rules.
- GOLDEN TEST NEEDED NO REGENERATION. `FIXED_COMPILE_INPUT` in golden-prompts.test.ts
  omits `connectedServices` (just as it omits `connectedToolkits`) → the new section
  is correctly absent on the bare path → byte-identical baseline. Confirmed by running
  `GENERATE_GOLDEN=true` → `git status --short tests/fixtures/golden/` empty. This is the
  CORRECT backward-compat outcome, matching the Composio precedent — NOT a missed update.
- A `.mjs` ESM path can't be loaded via `tsx -e "import ... .mjs"` inline eval
  (MODULE_NOT_FOUND on `.mjs` resolution) — don't bother with inline render proofs;
  the unit-test `toContain` assertions already prove the exact rendered strings.
- Extended the existing `agents-md-compiler-custom-integrations.test.ts` with a second
  describe block (7 tests) rather than a new file — keeps loadCustomIntegrations +
  section-render coverage co-located. 14 existing + 7 new = 21 in that file.

### Verification

- pnpm build: BUILD_EXIT:0
- targeted (custom-integrations + golden): 24 passed
- full unit suite: 159 files, 1840 passed, 9 skipped, 0 fail (TEST_EXIT:0)
- eslint changed files: LINT_EXIT:0
- golden regen: zero diff (backward-compatible)
- Evidence: .sisyphus/evidence/custom-skills/task-8-section.txt
