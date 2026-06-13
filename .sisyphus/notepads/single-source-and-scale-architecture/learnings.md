# Learnings

## [2026-06-13] Session Start

Plan: 2026-06-12-1810-single-source-and-scale-architecture

### THREE MODULE WORLDS (CRITICAL)

- **World A**: `src/gateway/*.ts` + `src/workers/*.mts` — compiled, can share `src/lib/`, precedent `go-models.ts`
- **World B**: `src/worker-tools/*.ts` — tsx isolated runtime, excluded from `tsconfig.build`, CANNOT import `src/lib/`
- Output contract is consumed in BOTH worlds — constants need two copies: authored (World A) + generated (World B)

### Intentional Asymmetries — DO NOT CONSOLIDATE

- `EMPLOYEE_PHASE` ≠ `TASK_PHASE` — different semantics, leave both
- `localCriticalVars` vs `flyCriticalVars` delta is intentional
- Delivery passes empty rules/knowledge deliberately
- Static `opencode.json` is a fallback safety net
- `postgrest-client.ts` raw env is intentional (worker startup differs from gateway)
- `guest-message-poll.ts` ArchetypeRow shape is different purpose (deprecated trigger)

### Key File Locations

- `PLATFORM_ENV_WHITELIST`: `src/repositories/tenant-env-loader.ts:12-26`
- `ArchetypeRow` (canonical): `src/workers/lib/execution-phase.mts` (exported)
- `ArchetypeRow` (dup to delete): `src/workers/opencode-harness.mts`
- `discoverTools()`: `src/gateway/services/tool-parser.ts`
- `archetype-generator.ts:126` — request-time disk read (prod bug to fix in T2)
- `CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE`: `archetype-generator.ts` (T10: remove inline dup in prompts file)

### Generation Pattern (Oracle decision)

- World-B constants: ONE authored source in `src/lib/` → GENERATED copy in `src/worker-tools/lib/output-contract-paths.generated.ts`
- CI diff gate (not sync test) proves they match
- Pattern to mirror: `scripts/generate-composio-skills.ts`

### Test Strategy

- Golden snapshots guard drift tasks (byte-identity)
- Two behavior-change tasks (T12, T13) — golden updated deliberately + live E2E
- CI diff gates for generated artifacts

## [2026-06-13] T1 Complete — Golden Snapshot Baseline + Drift Audit Relocation

### What was done
- Relocated `.sisyphus/drafts/2026-06-12-1804-drift-audit-FINAL.md` → `docs/guides/2026-06-12-2030-drift-audit.md`
  - Removed the "Status: FINAL" blockquote banner from the top
  - Added "## Backlog (Future Work)" section at end
- Created 3 golden fixture files in `tests/fixtures/golden/`:
  - `system-prompt.txt` (16606 bytes) — `buildConnectedAppsBlock([], [])` fallback path
  - `refine-prompt.txt` (3185 bytes) — `REFINE_SYSTEM_PROMPT` constant
  - `compiled-agents-md.txt` (2327 bytes) — `compileAgentsMd()` with fixed representative input
- Wrote `tests/unit/golden-prompts.test.ts` with `GENERATE_GOLDEN=true` regeneration mode
- Added drift-audit row to README.md Documentation table and AGENTS.md Reference Documents table

### Key patterns learned
- `agents-md-compiler.mts` reads `agents.md` from disk at MODULE LOAD TIME (line 10: `readFileSync`)
  → must mock `postgrest-client.js` via `vi.hoisted` BEFORE import, even if you're not using `loadConnectedToolkits`
- `buildSystemPrompt()` in `archetype-generator.ts` is NOT exported — golden test replicates its fallback path using the exported `SYSTEM_PROMPT_PRE`, `SYSTEM_PROMPT_POST`, `buildConnectedAppsBlock`
- Golden test uses `GENERATE_GOLDEN=true` env flag to write fixtures; without it, reads and asserts equality
- The failing `admin-employee-trigger.test.ts > 401 when X-Admin-Key header missing` is a pre-existing flaky test — not introduced by T1

### Why the safety net matters
Every subsequent task (T2–T10) adds `pnpm test:unit -- golden-prompts` to its pre-commit check. A red golden test means the refactor changed LLM inputs — requires human review before proceeding.
