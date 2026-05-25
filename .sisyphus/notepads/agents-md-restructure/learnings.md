# Learnings — agents-md-restructure

## [2026-05-25] Session Start

### Key Architecture Facts

- `resolveAgentsMd()` in `src/workers/lib/agents-md-resolver.mts` assembles AGENTS.md from 7 layers
- Current order: platform → platformRuntime → tenant → employee → rules → knowledge → closingSections
- Target order: tenant → employee → platformRuntime → rules → knowledge → platform → closingSections
- Static platform policy file: `src/workers/config/agents.md` (48 lines currently)
- Two call sites for `resolveAgentsMd()`: harness (execution + delivery) and brain-preview route

### Critical Constraints

- `agents_md.layers` API response keys MUST stay: `platform`, `platformRuntime`, `tenant`, `employee`, `rules`, `knowledge` — only H1 heading text changes
- `buildEnvManifestFromVars` import must stay in brain-preview (used for `autoInjectedSections.envManifest`)
- DO NOT change `resolveAgentsMd()` function signature
- DO NOT run `pnpm test` (known timeout issues)
- DO NOT use `--no-verify` on git commits

### Env Manifest Locations to Remove

1. `opencode-harness.mts` execution phase: lines 865-871 (PLATFORM_ENV_MANIFEST block)
2. `opencode-harness.mts` delivery phase: lines 699-704 (PLATFORM_ENV_MANIFEST block)
3. `admin-brain-preview.ts`: lines 269-274 (envManifestStr push into platformRuntimeSections) — KEEP the variable declaration and `autoInjectedSections.envManifest` usage at line 383
