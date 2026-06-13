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

## T5 — ArchetypeRow dedup (2026-06-12)

- `execution-phase.mts` exports both `ArchetypeRow` and `TaskWithArchetype` — both were duplicated byte-for-byte in `opencode-harness.mts`
- Import pattern: `import { runExecutionPhase, type ArchetypeRow, type TaskWithArchetype } from './lib/execution-phase.mjs';`
- Note: delivery-phase.mts does NOT import `ArchetypeRow` from execution-phase — it uses its own local type or receives it via function params; check before assuming it's a pattern to follow
- `.sisyphus/evidence/` is gitignored — evidence files stay local only

## [2026-06-13] T3 Complete

### What was done

Created `src/lib/output-contract-constants.ts` (World A authored source). Additive only — no consumers wired (T6 does that). Exports:

- `SUMMARY_PATH = '/tmp/summary.txt'`, `APPROVAL_MESSAGE_PATH = '/tmp/approval-message.json'`, `DRAFT_PATH = '/tmp/draft.txt'`
- `OutputClassification` — re-exported as `StandardOutput['classification']` (indexed access), NOT redefined
- `EXECUTION_PROMPT` — byte-identical to `execution-phase.mts` const (`'Follow the instructions in <execution-instructions> within the AGENTS.md file'`)
- `DELIVERY_PHASE_VALUE = 'delivery'`, `EXECUTION_PHASE_VALUE = 'execution'`, `OUTPUT_CONTRACT_VERSION = 1`

### Key facts confirmed from source

- `output-schema.mts` has NO standalone `OutputClassification` type — only the `StandardOutput` interface with `classification: 'APPROVED' | 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED'`. Re-export via indexed access `StandardOutput['classification']` is the correct single-source approach (no redefinition).
- submit-output.ts `VALID_CLASSIFICATIONS` is only `['NEEDS_APPROVAL','NO_ACTION_NEEDED']` (a subset) — the schema union is the superset (adds `APPROVED`). Re-exporting from the schema preserves the full union.
- `DRAFT_PATH` value `/tmp/draft.txt` confirmed at submit-output.ts:169 (the implicit fallback read).
- `EXECUTION_PROMPT` lives at execution-phase.mts:96-97 as a local `const` inside `runExecutionPhase` (not module-scoped/exported) — T6 will need to replace that local with an import.

### Module-boundary mechanics (World A)

- Import the schema with `.mjs` specifier: `import type { StandardOutput } from '../workers/lib/output-schema.mjs';` (NodeNext + `"type":"module"`). `type`-only import → erased at compile, zero runtime dep.
- Compiled output is ESM (`export const ...`). `node -e "require(...)"` STILL works on this file because it has no runtime imports — pure const exports transpile to a CJS-interop-compatible shape under Node's ESM/CJS bridge. (Don't assume require() works for World A files with runtime imports.)
- `tsconfig.build.json` excludes `src/worker-tools/**/*` and `tests` — this file is under `src/lib` so it compiles to `dist/lib/output-contract-constants.js`.

### Verification

- `pnpm build` → exit 0
- `node -e require dist → /tmp/summary.txt execution` (expected match)
- Evidence: `.sisyphus/evidence/task-3-constants.txt`

## [2026-06-13] T4 Complete — World-B generated constants + CI diff gate

### What was done

- Created `scripts/generate-worker-constants.ts` (mirrors `generate-composio-skills.ts`): imports authored VALUES from `src/lib/output-contract-constants.js`, emits `src/worker-tools/lib/output-contract-paths.generated.ts` via `writeIfChanged` (content-change check → stable mtime → clean git diff on re-run).
- `OutputClassification` is emitted as a LITERAL UNION string, not a runtime read — it's a type, unreadable at runtime, and World B can't import it from World A. The CI diff gate is the only sync guarantee (no Vitest sync test by design).
- Added `package.json` script + CI step "Check worker-constants freshness" in `deploy.yml` (after Composio freshness, before unit tests).
- Removed the gitignore line for the generated file — it MUST be committed for the CI diff gate to function. The c0ea64cc-era narrowing was reverted for this specific file.

### Key facts

- Generator imports only the VALUES (paths/phase/version) from World A — NOT the type. Values via `import { SUMMARY_PATH, ... } from '../src/lib/output-contract-constants.js'`.
- The generated `.ts` lands in World B but is a pure-const + type file: `pnpm build` excludes `src/worker-tools/**` so tsc never compiles it; eslint/prettier DO cover it (passes clean).
- zsh: use `$?` after a redirect, not bash `$PIPESTATUS` (renders empty in this shell).

### Verification

- `pnpm generate-worker-constants && git diff --exit-code <generated>` → exit 0 (idempotent)
- `pnpm build` → exit 0 · eslint → exit 0 · prettier --check → clean
- `git check-ignore <generated>` → exit 1 (NOT ignored, committable)
- Committed: a108f3c5

## [2026-06-13] T6 Complete — Wire World-A and World-B consumers to single output-contract source

### What was done

All World-A consumers now import from `src/lib/output-contract-constants.ts`:
- `src/workers/lib/output-contract.mts` — SUMMARY_PATH, APPROVAL_MESSAGE_PATH (5 occurrences)
- `src/workers/lib/delivery-phase.mts` — SUMMARY_PATH
- `src/workers/opencode-harness.mts` — SUMMARY_PATH, APPROVAL_MESSAGE_PATH, DELIVERY_PHASE_VALUE
- `src/workers/lib/harness-helpers.mts` — APPROVAL_MESSAGE_PATH
- `src/workers/lib/execution-phase.mts` — EXECUTION_PROMPT (removed local const)
- `src/inngest/lifecycle/steps/delivery-retry.ts` — DELIVERY_PHASE_VALUE (both local + Fly env objects)
- `src/gateway/routes/admin-brain-preview.ts` — EXECUTION_PROMPT, SUMMARY_PATH, APPROVAL_MESSAGE_PATH
- `src/gateway/services/prompts/archetype-generator-prompts.ts` — SUMMARY_PATH, APPROVAL_MESSAGE_PATH

All World-B consumers now import from `src/worker-tools/lib/output-contract-paths.generated.ts`:
- `src/worker-tools/platform/submit-output.ts` — SUMMARY_PATH, DRAFT_PATH
- `src/worker-tools/slack/post-guest-approval.ts` — SUMMARY_PATH, APPROVAL_MESSAGE_PATH

### Key discoveries

1. **`archetype-generator-prompts.ts` is safe to use constant interpolation**: The golden test imports the EXPORTED VALUES (SYSTEM_PROMPT_PRE, SYSTEM_PROMPT_POST, REFINE_SYSTEM_PROMPT) and tests their evaluated output — not source text. Using `${SUMMARY_PATH}` in the template literal produces byte-identical output since the value is the same string.

2. **`agents-md-compiler.test.ts` reads source text**: The nudge message test reads the raw source of `opencode-harness.mts` via `readFileSync` and pattern-matches for `const nudgeMessage`. After changing the nudge message to use `${SUMMARY_PATH}`, the test assertion was updated from `toContain('/tmp/summary.txt')` to `toContain('SUMMARY_PATH')`.

3. **`APPROVAL_OUTPUT_PATH` local variable in `post-guest-approval.ts`**: Three references existed beyond the `const` declaration — all updated to `APPROVAL_MESSAGE_PATH` after removing the local const.

4. **Test fixture strings**: Three test files had `/tmp/summary.txt` in archetype instruction fixture strings — simplified to remove the path (not needed for test coverage).

### Verification

- `pnpm build` → exit 0
- `pnpm test:unit -- golden-prompts` → 3/3 GREEN (byte-identical output confirmed)
- `grep -r '/tmp/summary.txt\|/tmp/approval-message.json' src/` → only the two constant source files
- Commit: cb80a171

## [2026-06-13] T7 Complete — skill-registry single source

### What was done
- Created `src/lib/skill-registry.ts` (World A, mirrors `go-models.ts` style): `getWorkerSkills(skillsDir?)` reads `src/workers/skills/*/SKILL.md`, parses `---`-delimited frontmatter for `name`+`description`, returns `WorkerSkill[]` sorted by name.
- `admin-brain-preview.ts` `skills: [...]` hardcoded 2-item list → `skills: getWorkerSkills()`. Now returns ALL 6 on-disk skills (composio-gmail/notion/slack/slackbot, tool-usage-reference, uuid-disambiguation) instead of 2 — preview is now truthful.
- `tests/unit/skill-registry.test.ts` — 6 tests incl. temp-dir add + quoted/unquoted parse.

### Key facts
- SKILL.md frontmatter descriptions are MIXED quoting: composio-* + tool-usage-reference use single-quotes; uuid-disambiguation is UNQUOTED. Parser must `stripQuotes` (handles both ' and ") AND accept bare values.
- Reads FRESH from disk each call (no module cache) — required for the temp-file test and so new skills appear without restart. Cheap (6 small files).
- `getWorkerSkills(dir)` takes optional dir param → enables isolated temp-dir testing without touching real skills.
- Pre-existing failing test (NOT mine): `tests/unit/gateway/socket-mode-lock.test.ts > blocked-live` — fails even with my changes stashed (detects live gateway PID in dev env). Ignore.

### Verification
- `pnpm vitest run tests/unit/skill-registry.test.ts` → 6/6 GREEN
- `pnpm build` → exit 0 · eslint → 0 · prettier → clean
- `node -e require dist/lib/skill-registry → count: 6`

## [2026-06-13] T9 Complete — env-enforcement parity test

### What was done

- Created `tests/unit/env-enforcement.test.ts` (3 assertions) — proves every platform env var in `ALL_TOOL_DESCRIPTORS[].envVars` is in `PLATFORM_ENV_WHITELIST`.
- `export`ed `PLATFORM_ENV_WHITELIST` from `tenant-env-loader.ts` (was private). Test IMPORTS the real source rather than hardcoding a 4th copy — true drift-proof parity, matches the plan's single-source theme.
- NO `.env`/`.env.example` changes needed: all 4 platform vars referenced by descriptors (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`, `COMPOSIO_API_KEY`) were ALREADY whitelisted AND already in `.env.example`.

### Key findings (drift discovered, not introduced)

- **`get-token` descriptor in `src/lib/tool-registry.ts` is STALE**: it lists `GITHUB_APP_ID, GITHUB_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID`, but the REAL tool file `src/worker-tools/github/get-token.ts` exports `descriptor.envVars: ['TASK_ID']` only. The tool delegates token minting to the gateway (`POST /internal/tasks/:id/github-token`), so it never reads the App creds itself.
- `GITHUB_APP_ID`/`GITHUB_PRIVATE_KEY` are platform-level but **gateway-consumed** (`github-token-manager.ts > generateAppJwt`). They MUST NOT be whitelisted — injecting the platform's GitHub App private key into every worker container is a tenant-isolation regression. Modeled as a distinct `GATEWAY_ONLY_VARS` exemption set (3rd security category beyond tenant-secret / task-scoped).
- `loadTenantEnv()` builds `PLATFORM_ENV_MANIFEST` from `PLATFORM_ENV_WHITELIST` + tenant secrets ONLY. Descriptor `envVars` arrays are informational/docs — NOT an injection source. So the stale `get-token` descriptor is a doc-drift bug, not an active injection bug. (Did NOT fix the descriptor here — out of T9 scope; the registry is T2's artifact. Flagged for backlog.)

### Exemption sets (enumerated, no catch-all)

- TENANT_SECRET_VARS: SLACK_BOT_TOKEN, HOSTFULLY_API_KEY, SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD
- TASK_SCOPED_VARS: TASK_ID, TENANT_ID
- GATEWAY_ONLY_VARS: GITHUB_APP_ID, GITHUB_PRIVATE_KEY
- Only vars ACTUALLY present in descriptor envVars are exempted. A 3rd test assertion ("every exempted var is actually referenced") rejects stale exemptions — kept me from copying the task example's phantom vars (HOSTFULLY_AGENCY_UID, WEBHOOK_PUBLIC_URL, SIFELY_CLIENT_SECRET, NOTIFICATION_CHANNEL, EMPLOYEE_PHASE, TASK_PHASE, TASK_TENANT_ID — none appear in real descriptors).

### Gotchas

- `as const` on the exported whitelist BROKE the build: line 91 `PLATFORM_ENV_WHITELIST.includes(k: string)` rejects a generic string against the narrowed literal-union element type (TS2345). Keep it a plain `string[]` — `new Set<string>(PLATFORM_ENV_WHITELIST)` in the test works fine without `as const`.
- `socket-mode-lock.test.ts > blocked-live` is a PRE-EXISTING flaky PID-race fail (confirmed on clean `git stash`: 5 pass / 1 fail). Not a T9 regression.
- `pnpm test:unit -- env-enforcement` does NOT filter — runs the full suite. Use `pnpm exec vitest run tests/unit/env-enforcement.test.ts` to isolate.

### Verification

- `pnpm exec vitest run tests/unit/env-enforcement.test.ts` → 3/3 GREEN
- related: tool-descriptors.test.ts (11) + tenant-env-loader.test.ts (21) → all pass
- `pnpm build` → exit 0 · eslint clean · prettier clean

## [2026-06-13] T11 Complete — tool-usage-reference SKILL.md generated from descriptors

### What was done
- Created `scripts/generate-tool-usage-skill.ts` (mirrors `generate-worker-constants.ts`/`generate-composio-skills.ts`): imports `ALL_TOOL_DESCRIPTORS` from `src/lib/tool-registry.js`, generates per-tool CLI reference, writes ABOVE a sentinel. Uses `writeIfChanged` + `normaliseLf` for idempotency.
- Inserted sentinel `<!-- HAND-WRITTEN: DO NOT GENERATE BELOW -->` into SKILL.md. Generator BOOTSTRAPS the sentinel on first run by locating `## ⚠️ CRITICAL WARNINGS` heading and prepending it — no manual edit of SKILL.md needed.
- Generated section: frontmatter (preserved verbatim via regex extract) + `# Tool Usage Reference` intro + auto-gen HTML comment + per-tool `## {service}/{id}` sections sorted by service then id.
- Hand-written section (sentinel → EOF) preserved byte-for-byte: ALL the rich curated per-service docs that were originally below CRITICAL WARNINGS are kept — only the generator REPLACES the top portion.
- Added `package.json` script + CI gate "Check tool-usage-skill freshness" in deploy.yml (after worker-constants step).
- Created `tests/unit/tool-usage-skill-sentinel.test.ts` (3 tests): sentinel exactly once, warnings preserved below, generated sections above.

### Key facts / gotchas
- **Prettier on generated skill markdown is intentionally unclean** — DO NOT run `prettier --write` on SKILL.md. Precedent: `composio-*/SKILL.md` are also prettier-unclean. The original committed SKILL.md was ALSO prettier-unclean. CI runs `pnpm lint` (eslint) NOT prettier; lint-staged only covers `*.{ts,tsx}`. Prettier wants to escape `2 + 2 * 3` → `2 + 2 \* 3` (from the `calculate` descriptor example) which would BREAK idempotency (generator re-emits unescaped → next run diffs). Generated skill md is correctly outside prettier enforcement.
- **First-run bootstrap pattern**: `extractHandWritten()` checks for sentinel first; if absent, finds the bootstrap heading and prepends `${SENTINEL}\n\n`. Throws if neither found (refuses to overwrite). This makes the generator self-installing — running it once does Step 2 (insert sentinel) AND Step 3 (generate body) atomically.
- Idempotency proof requires staging first: `git add SKILL.md && pnpm generate && git diff --exit-code` → exit 0. A bare `git diff` against the un-generated HEAD will show the full insertion (expected).
- LSP (`typescript-language-server`) unavailable in this env (asdf "No version is set") — verified via `pnpm build` (tsc) + eslint instead.

### Verification
- `pnpm generate-tool-usage-skill && git diff --exit-code` (after staging) → exit 0 (idempotent)
- `pnpm exec vitest run tool-usage-skill-sentinel` → 3/3 GREEN
- `pnpm build` → exit 0 · eslint (script+test) → 0 · prettier (script+test) → clean
- golden-prompts + skill-registry + tool-descriptors → 23/23 GREEN (no regressions)
