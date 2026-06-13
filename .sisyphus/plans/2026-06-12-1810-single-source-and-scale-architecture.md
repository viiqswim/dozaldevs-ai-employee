# Single Source of Truth — Eliminate Information Drift + Scale-Ready Architecture

## TL;DR

> **Quick Summary**: Give every conceptual fact (output-contract paths, classification enums, launch prompt, phase values, tool metadata, skill metadata, env requirements) ONE authored source, with everything else GENERATED from it (not kept in sync by tests). Replace regex-over-source tool discovery with typed `ToolDescriptor` exports + startup caching. Then add two scale-hardening behavior changes: capability enforcement of `tool_registry` and output-contract versioning. A golden-snapshot baseline proves the pure-drift work is behavior-preserving; the two behavior changes are covered by live E2E.
>
> **Deliverables**:
>
> - Drift-audit doc + golden-snapshot baseline (proves byte-identity for drift work)
> - Typed `ToolDescriptor` exported by every shell tool; `discoverTools()` becomes a typed aggregator (no regex); discovery cached at gateway startup (kills the prod disk-read bug structurally)
> - `src/lib/output-contract-constants.ts` single authored source; World-B copy GENERATED via build step + CI diff gate (no sync test)
> - Consumers across both module worlds wired to the single source
> - `ArchetypeRow` deduplicated; `src/lib/skill-registry.ts` (frontmatter-derived); `tool_registry` path-validation; env enforcement as a typed assertion over descriptors
> - Generator prompt interpolates shared constants (golden-guarded); `tool-usage-reference/SKILL.md` generated from descriptors (sentinel-preserved warnings; hard CI gate)
> - **Behavior change**: `tool_registry` enforced as a capability allowlist (flag-gated, registries validated/backfilled first)
> - **Behavior change**: output-contract `version` field + harness compatibility check
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 6 waves
> **Critical Path**: Golden baseline → Typed descriptors → src/lib source + generated World-B + startup cache → wire consumers → generator/codegen → enforcement + versioning → live E2E

---

## Context

### Original Request

"How do we make sure that the tools, the skills, the information used for AI employee creation, the execution and delivery phases, and anything else, all have the exact same source of information so that as changes happen, there is zero drift? What are all the areas we need to consolidate?"

Follow-up: "Verify the END-STATE architecture is the best we can do for code-organization, scalability, and maintainability at millions of users + many concurrent engineers. If not, modify it."

### Decisions

- **Audit-first**, then consolidate, all in ONE plan.
- **Mechanism**: single authored source → GENERATE derived copies (CI diff gate); typed descriptors over regex; build-time/startup derivation over request-time.
- **Scope**: all four areas + two scale-hardening behavior changes (capability enforcement, contract versioning).

### Oracle Architecture Review (drives this revision)

The first-draft plan was drift-free but **structurally conservative** — it leaned on "two authored copies + sync test" and "regex-scan source at runtime," both of which become a maintenance tax at scale. Adopted changes:

- **Generate, don't sync-test** the World-B constants (one authored source; emitted copy; CI diff gate).
- **Typed `ToolDescriptor`** replaces regex discovery — highest-leverage change; simplifies env enforcement, codegen, and discovery simultaneously. Sequenced early.
- **Startup-cached discovery** (or static import) replaces request-time disk reads — the prod "source not in gateway image" bug disappears structurally.
- **Capability enforcement** of `tool_registry` (security boundary, not advisory) — IN SCOPE, flag-gated, registries validated first.
- **Output-contract versioning** for rolling-deploy compatibility — IN SCOPE.
- Backlog (NOT this plan): AGENTS.md typed-section schema; prompts as versioned template objects with named slots. Recorded in the audit doc as future work.

### Metis Gap Analysis (still in force except where Oracle overrides)

- **THREE module worlds**: A = gateway `.ts` + worker `.mts` (compiled, can share `src/lib/`, precedent `go-models.ts`). B = `src/worker-tools/*.ts` (tsx, isolated `node_modules`, excluded from `tsconfig.build`, CANNOT import `src/lib/`). The output contract is consumed in both.
- **No byte-identity anchor exists today** → golden snapshots created FIRST, blocks everything.
- **Intentional asymmetries — DO NOT consolidate**: `EMPLOYEE_PHASE`≠`TASK_PHASE`; `local`/`flyCriticalVars` delta is correct; delivery passes empty rules/knowledge deliberately; static `opencode.json` is a fallback; `postgrest-client.ts` raw env is intentional.
- Cluster C = 2 copies; `EXEC_IMPORTANT` `step N` placeholder stays inline; `stripEmbeddedStopDirectives()` coupling preserved; `PLATFORM_ENV_WHITELIST` lives in `src/repositories/tenant-env-loader.ts`.
- Pre-written audit content at `.sisyphus/drafts/2026-06-12-1804-drift-audit-FINAL.md` (all file:line verified).

---

## Work Objectives

### Core Objective

One authored source per fact with everything else generated; typed/cached tool discovery; plus capability enforcement and contract versioning — so the platform scales to many tenants, millions of tasks, and many concurrent engineers without drift or silent tool/version failures.

### Definition of Done

- [ ] `pnpm test:unit -- golden` → PASS for all drift tasks (byte-identity preserved); deliberately updated for the two behavior-change tasks
- [ ] `pnpm generate-worker-constants && git diff --exit-code` → clean (World-B copy is generated)
- [ ] `pnpm generate-tool-usage-skill && git diff --exit-code` → clean
- [ ] `pnpm test:unit -- "tool-descriptors|env-enforcement|tool-registry-paths|skill-registry"` → PASS
- [ ] `pnpm test -- --run` → no new failures; `pnpm lint` + `pnpm build` → PASS
- [ ] Live E2E: employee reaches `Done`; an unauthorized tool call is BLOCKED by capability enforcement; a version-mismatched contract is handled gracefully

### Must Have

- Golden baseline before any extraction (drift tasks must prove byte-identity)
- Single authored source + generated derivatives (no hand-maintained duplicate pairs)
- Typed descriptors + startup-cached discovery
- Capability enforcement gated behind a per-archetype flag, defaulting OFF until registries are validated/backfilled and E2E-verified
- Contract `version` field with backward-compatible harness handling
- `docker build` before live E2E

### Must NOT Have (Guardrails)

- MUST NOT keep any hand-maintained duplicate-pair-plus-sync-test where generation is possible (Oracle: generate instead).
- MUST NOT read tool source from disk in a request handler (discovery is startup-cached / static import).
- MUST NOT merge `EMPLOYEE_PHASE`/`TASK_PHASE`; MUST NOT unify `local`/`flyCriticalVars`; MUST NOT collapse the two env builders; MUST NOT alter delivery's empty rules/knowledge; MUST NOT delete static `opencode.json`; MUST NOT "fix" `postgrest-client.ts` raw env.
- MUST NOT touch deprecated/on-hold files (engineering lifecycle, redispatch, watchdog, orchestrate.mts, entrypoint.sh, generic-harness, tools/registry.ts, the on-hold `src/workers/lib/` utilities).
- MUST NOT reword/reflow prompt text in the drift tasks — interpolation must be byte-identical (golden-guarded).
- MUST NOT enable capability enforcement globally without first validating/backfilling every active employee's `tool_registry` (an employee missing a tool it uses would break). Flag defaults OFF.
- MUST NOT change `autoupdate:false`, the OpenCode `1.14.31` pin, or any approved-model list.
- (REMOVED from prior draft: the "tool_registry must stay advisory" guardrail — user opted into enforcement.)

---

## Verification Strategy (MANDATORY)

> ZERO HUMAN INTERVENTION. All verification agent-executed.

### Test Decision

- Infrastructure: Vitest (`pnpm test:unit`, `pnpm test:integration`).
- **Golden snapshots** guard drift tasks (byte-identity). For the two behavior-change tasks, goldens are updated deliberately and the change is proven by **live E2E**, not frozen.
- **CI diff gates** for generated artifacts (World-B constants, SKILL.md).
- Live E2E is MANDATORY and sufficient-only-when-combined: the output-contract, enforcement, and versioning changes touch the live worker→harness contract that unit tests cannot fully cover.

### QA Tooling

- Unit/codegen: Bash (`pnpm test:unit -- <pattern>`, `pnpm <gen> && git diff --exit-code`).
- Live E2E: `docker build` + `pnpm trigger-task` + PostgREST curl + `task_status_log` query. Smoke employee: `real-estate-motivation-bot-2`, model override `deepseek/deepseek-v4-flash`.

---

## Execution Strategy

### Waves

```
Wave 1 (Foundation — BLOCKS all):
└── T1  Golden baseline + relocate drift-audit doc            [deep]

Wave 2 (Typed descriptors — touches every tool, own wave):
└── T2  ToolDescriptor type + per-tool descriptors + typed discoverTools + startup cache  [deep]

Wave 3 (Authored sources + structural dedup):
├── T3  src/lib/output-contract-constants.ts (authored)       [unspecified-high]
├── T4  Generate World-B constants + CI diff gate             [unspecified-high]
└── T5  ArchetypeRow dedup                                     [quick]

Wave 4 (Wire + derive):
├── T6  Wire World-A + World-B consumers to constants         [deep]
├── T7  skill-registry from frontmatter                        [unspecified-high]
├── T8  tool_registry path-validation test                     [quick]
└── T9  env enforcement as typed assertion over descriptors    [unspecified-high]

Wave 5 (Generator + codegen):
├── T10 Generator prompt interpolation (Cluster E+A)           [deep]
└── T11 tool-usage SKILL.md generated from descriptors         [unspecified-high]

Wave 6 (Scale-hardening behavior changes):
├── T12 tool_registry capability enforcement (flag-gated)      [deep]
└── T13 output-contract version field + compat check          [deep]

Wave FINAL (review + live E2E + docs):
├── F1 Plan compliance (oracle) │ F2 Code quality (unspecified-high)
├── F3 Live E2E incl. enforcement + version mismatch (unspecified-high)
├── F4 Scope fidelity (deep)
├── T14 Docs (writing) │ T15 Telegram notify (quick)
-> Present -> user okay

Critical Path: T1 → T2 → T3/T4 → T6 → T10/T11 → T12/T13 → F3 → okay
```

### Dependency Matrix

- **T1**: — → blocks all
- **T2**: T1 → blocks T8, T9, T11, T12
- **T3**: T1 → blocks T4, T6, T10
- **T4**: T3 → blocks T6
- **T5**: T1 → blocks F4
- **T6**: T3, T4 → blocks T10, T13, F3
- **T7**: T1 → blocks F2
- **T8**: T1, T2 → blocks T12 (registries validated before enforcement)
- **T9**: T2 → blocks F2
- **T10**: T3, T6 → blocks F3
- **T11**: T2 → blocks F2
- **T12**: T2, T8 → blocks F3
- **T13**: T6 → blocks F3
- **T14**: F1–F4 → final docs
- **T15**: T14

---

## TODOs

> Implementation + Test = ONE task. Every task: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Golden-snapshot baseline + relocate drift-audit doc

  > **RESEARCH PRE-DONE.** Full audit content at `.sisyphus/drafts/2026-06-12-1804-drift-audit-FINAL.md` (all file:line verified). This is relocate + snapshot, not research.

  **What to do**:
  - Relocate `.sisyphus/drafts/2026-06-12-1804-drift-audit-FINAL.md` → `docs/guides/{run `date "+%Y-%m-%d-%H%M"`}-drift-audit.md` (re-stamp filename; drop the "Status: FINAL" banner; keep content). Add the "Backlog (future work)" note: AGENTS.md typed-section schema + prompts-as-versioned-templates. Add rows to README.md + AGENTS.md reference tables.
  - Create golden fixtures capturing CURRENT output: `tests/fixtures/golden/system-prompt.txt` (generator system prompt with EMPTY tool catalog for determinism), `refine-prompt.txt` (`REFINE_SYSTEM_PROMPT`), `compiled-agents-md.txt` (`compileAgentsMd()` for a fixed representative input).
  - Write `tests/unit/golden-prompts.test.ts` asserting each function's output `=== readFileSync(golden)`. Must pass on unchanged code.

  **Must NOT do**: No production code changes. No re-authoring the audit (drafts file is final).

  **Recommended Agent Profile**: `deep`; Skills [`creating-archetypes`] (generator + compiler fields to build a valid `compileAgentsMd` input).

  **Parallelization**: Wave 1, alone. Blocks ALL. Blocked by none.

  **References**:
  - `src/gateway/services/prompts/archetype-generator-prompts.ts` — `SYSTEM_PROMPT_PRE` + `REFINE_SYSTEM_PROMPT` (called from `archetype-generator.ts:127` after `discoverTools`).
  - `src/workers/lib/agents-md-compiler.mts` — `compileAgentsMd()`.
  - `.sisyphus/drafts/2026-06-12-1804-drift-audit-FINAL.md` — the finished audit.
    **WHY**: No byte-identity anchor exists today; this is the safety net that makes the drift refactor provably behavior-preserving.

  **Acceptance Criteria**:
  - [ ] 3 golden fixtures + `golden-prompts.test.ts` created, PASS on unchanged code
  - [ ] audit doc relocated (banner removed, backlog note added); reference tables updated

  **QA Scenarios**:

  ```
  Scenario: Golden green against unchanged code
    Tool: Bash
    Steps: 1) pnpm test:unit -- golden-prompts  2) assert N passed, 0 failed
    Expected: all golden assertions GREEN
    Evidence: .sisyphus/evidence/task-1-golden.txt
  Scenario: Audit relocated and well-formed
    Tool: Bash
    Steps: 1) ls docs/guides/*drift-audit.md  2) grep -c "Cluster\|Backlog\|PRODUCTION FINDING" <file>  3) grep -L "Status: FINAL" <file>
    Expected: exists; >=3 sections; banner absent
    Evidence: .sisyphus/evidence/task-1-doc.txt
  ```

  **Commit**: YES — `test(golden): baseline prompt/compiler snapshots + drift audit` — Files: `tests/fixtures/golden/*`, `tests/unit/golden-prompts.test.ts`, `docs/guides/*-drift-audit.md`, `README.md`, `AGENTS.md` — Pre-commit: `pnpm test:unit -- golden-prompts`

- [x] 2. Typed `ToolDescriptor` + per-tool descriptors + typed discovery + startup cache

  > **HIGHEST-LEVERAGE TASK (Oracle).** Converts tool metadata from regex-recovered to type-checked, and discovery from request-time disk read to startup cache. Touches every tool file → its own wave.

  **What to do**:
  - Define `ToolDescriptor` in `src/worker-tools/lib/types.ts` (World B): `{ id: string; service: string; description: string; envVars: string[]; args: { name, required, description }[] }`.
  - In EACH tool under `src/worker-tools/**/*.ts` (excluding `_template/`), add `export const descriptor: ToolDescriptor = {...}` capturing what the tool's `--help`/`requireEnv()` already encode. Keep `--help` output byte-identical for now (employees read it) — descriptor is additive.
  - Rework `src/gateway/services/tool-parser.ts` `discoverTools()` from regex-scan into a typed aggregator that imports/collects the exported descriptors (build-time/startup, not request-time). Preserve the existing `ToolMetadata` shape consumed by `archetype-generator.ts` + `admin-tools.ts` so downstream is unaffected.
  - Add a startup cache: gateway computes the tool catalog once at boot and serves the cached value to the generator + admin routes (no `process.cwd()` disk read per request). This structurally removes the prod "src/worker-tools not in gateway image" bug (audit §6) — confirm the generator no longer reads disk at request time.
  - `tests/unit/tool-descriptors.test.ts`: every tool file exports a `descriptor`; ids unique; `envVars` non-empty where `requireEnv` is used.

  **Must NOT do**: Don't change any tool's runtime behavior or `--help` text. Don't import `src/lib/` from World B.

  **Recommended Agent Profile**: `deep`; Skills [`adding-shell-tools`, `api-design`] (tool conventions + the gateway discovery/route consumers).

  **Parallelization**: Wave 2, alone (broad touch). Blocks T8, T9, T11, T12. Blocked by T1.

  **References**:
  - `src/gateway/services/tool-parser.ts` — current `discoverTools()` regex engine to replace with typed aggregation.
  - `src/gateway/services/archetype-generator.ts:126-145` — request-time disk read + fallback to fix via startup cache.
  - `src/worker-tools/slack/post-message.ts`, `platform/submit-output.ts`, `hostfully/get-messages.ts` — representative tools to model descriptors on (`requireEnv`, args, `--help`).
  - `src/worker-tools/lib/unescape-args.ts` — example World-B shared lib.
    **WHY**: Regex-over-source silently drops non-matching tools and breaks on CLI changes with no compile signal; request-time disk reads are a hot-path latency + prod-correctness liability. Typed descriptors + startup cache fix both and underpin T9/T11/T12.

  **Acceptance Criteria**:
  - [ ] `ToolDescriptor` type + a `descriptor` export in every tool (except `_template/`)
  - [ ] `discoverTools()` aggregates descriptors (no regex source-scan); result startup-cached
  - [ ] generator no longer reads tool source from disk per request
  - [ ] `tool-descriptors.test.ts` PASS; `golden-prompts` still GREEN (generator output unchanged)

  **QA Scenarios**:

  ```
  Scenario: Every tool has a typed descriptor
    Tool: Bash
    Steps: 1) pnpm test:unit -- tool-descriptors  2) assert PASS
    Expected: all tools export a unique descriptor
    Evidence: .sisyphus/evidence/task-2-descriptors.txt
  Scenario: Discovery no longer regex/disk at request time + catalog non-empty
    Tool: Bash
    Steps: 1) grep -n "process.cwd()" src/gateway/services/archetype-generator.ts (expect: gone or behind startup cache)  2) node -e "build + call cached discovery" prints >0 tools
    Expected: no per-request disk read; catalog populated
    Evidence: .sisyphus/evidence/task-2-discovery.txt
  Scenario: Generator output unchanged
    Tool: Bash
    Steps: 1) pnpm test:unit -- golden-prompts
    Expected: GREEN (descriptors are additive)
    Evidence: .sisyphus/evidence/task-2-golden.txt
  ```

  **Commit**: YES — `refactor(tools): typed ToolDescriptor + typed startup-cached discovery` — Files: `src/worker-tools/lib/types.ts`, `src/worker-tools/**/*.ts`, `src/gateway/services/tool-parser.ts`, `src/gateway/services/archetype-generator.ts`, `tests/unit/tool-descriptors.test.ts` — Pre-commit: `pnpm test:unit -- "tool-descriptors|golden-prompts"`

- [x] 3. `src/lib/output-contract-constants.ts` — single authored source

  **What to do**:
  - Create `src/lib/output-contract-constants.ts` exporting (byte-identical to current values): `SUMMARY_PATH='/tmp/summary.txt'`, `APPROVAL_MESSAGE_PATH='/tmp/approval-message.json'`, `DRAFT_PATH='/tmp/draft.txt'`, the classification union re-exported from `src/workers/lib/output-schema.mts` (`APPROVED|NEEDS_APPROVAL|NO_ACTION_NEEDED`), `EXECUTION_PROMPT` (exact string from `execution-phase.mts`), `DELIVERY_PHASE_VALUE='delivery'`, `EXECUTION_PHASE_VALUE='execution'`.
  - Follow `src/lib/go-models.ts` style (`.ts`, imported as `.js`). Additive only — no consumers wired yet.

  **Must NOT do**: No value/whitespace changes vs current. No phase-semantics merge.

  **Recommended Agent Profile**: `unspecified-high`; Skills [`data-access-conventions`] (`src/lib/` boundary).

  **Parallelization**: Wave 3 (with T4, T5). Blocks T4, T6, T10. Blocked by T1.

  **References**:
  - `src/lib/go-models.ts` — shared-module pattern.
  - `src/workers/lib/output-schema.mts:5,15` — classification enum (re-export, don't redefine).
  - `src/worker-tools/platform/submit-output.ts:23`, `src/workers/lib/execution-phase.mts:96` — exact current values.
    **WHY**: The authoritative home for World-A facts; everything else derives from it (T4 generates the World-B copy; T6 wires consumers).

  **Acceptance Criteria**:
  - [ ] module created exporting all listed constants; `pnpm build` clean

  **QA Scenarios**:

  ```
  Scenario: Constants resolve to exact current values
    Tool: Bash
    Steps: 1) pnpm build  2) node -e "const m=require('./dist/lib/output-contract-constants.js'); console.log(m.SUMMARY_PATH,m.EXECUTION_PHASE_VALUE)"  3) assert "/tmp/summary.txt execution"
    Expected: build clean; values match current literals
    Evidence: .sisyphus/evidence/task-3-constants.txt
  ```

  **Commit**: YES — `refactor(lib): authored output-contract + phase constants` — Files: `src/lib/output-contract-constants.ts` — Pre-commit: `pnpm build`

- [x] 4. Generate the World-B constants (no sync test)

  > **Oracle change**: replace "duplicate constant + sync test" with "one authored source + generated copy + CI diff gate."

  **What to do**:
  - Create `scripts/generate-worker-constants.ts` that imports the authored values from `src/lib/output-contract-constants.ts` and EMITS `src/worker-tools/lib/output-contract-paths.generated.ts` with a `// @generated by scripts/generate-worker-constants.ts — do not edit` header, exporting the same path/classification values for World-B consumers.
  - Add `package.json` script `generate-worker-constants` → `tsx scripts/generate-worker-constants.ts`. Run it once and commit the emitted file.
  - Add a CI gate (in `deploy.yml` test job): `pnpm generate-worker-constants && git diff --exit-code src/worker-tools/lib/output-contract-paths.generated.ts`. No secret needed → hard gate.
  - No Vitest sync test — the generated file plus the diff gate is the guarantee.

  **Must NOT do**: Don't hand-edit the generated file. Don't make World-B import `src/lib/` directly.

  **Recommended Agent Profile**: `unspecified-high`; Skills [`adding-shell-tools`, `data-access-conventions`].

  **Parallelization**: Wave 3 (with T3 dep, T5). Blocks T6. Blocked by T3.

  **References**:
  - `scripts/generate-composio-skills.ts` — existing codegen + CI-diff pattern to mirror.
  - `.github/workflows/deploy.yml` (test job) — where the diff gate goes.
  - `src/lib/output-contract-constants.ts` — the authored source to read.
    **WHY**: One authored source, one obviously-generated copy. Eliminates the "edited one, forgot the other" failure mode entirely — better than a sync test for many concurrent engineers.

  **Acceptance Criteria**:
  - [ ] generator script + `package.json` entry; emitted file has `// @generated` header
  - [ ] CI diff gate added; regeneration is idempotent (clean diff)

  **QA Scenarios**:

  ```
  Scenario: Generation idempotent + gate clean
    Tool: Bash
    Steps: 1) pnpm generate-worker-constants  2) git diff --exit-code src/worker-tools/lib/output-contract-paths.generated.ts
    Expected: exit 0 (committed == generated)
    Evidence: .sisyphus/evidence/task-4-gen.txt
  Scenario: Negative — editing the source regenerates the copy
    Tool: Bash
    Steps: 1) temporarily change a value in src/lib constants  2) pnpm generate-worker-constants  3) git diff shows the generated file changed  4) revert both
    Expected: generated copy tracks the authored source
    Evidence: .sisyphus/evidence/task-4-negative.txt
  ```

  **Commit**: YES — `feat(tools): generate World-B output-contract constants from src/lib source` — Files: `scripts/generate-worker-constants.ts`, `package.json`, `src/worker-tools/lib/output-contract-paths.generated.ts`, `.github/workflows/deploy.yml` — Pre-commit: `pnpm generate-worker-constants && git diff --exit-code src/worker-tools/lib/output-contract-paths.generated.ts`

- [x] 5. Dedup `ArchetypeRow` interface

  **What to do**: Delete the byte-identical duplicate `ArchetypeRow` in `src/workers/opencode-harness.mts` and import it from `src/workers/lib/execution-phase.mts` (already exported; `delivery-phase.mts` already does this). Leave the minimal `guest-message-poll.ts` shape (different purpose, deprecated trigger).

  **Must NOT do**: Don't unify with `guest-message-poll.ts`; don't change any field.

  **Recommended Agent Profile**: `quick`; Skills [].

  **Parallelization**: Wave 3 (with T3, T4). Blocks F4. Blocked by T1.

  **References**:
  - `src/workers/lib/execution-phase.mts` (exported `ArchetypeRow`); `src/workers/opencode-harness.mts` (dead dup); `src/workers/lib/delivery-phase.mts` (correct import style).
    **WHY**: Adding a DB archetype field today means editing the interface in multiple places.

  **Acceptance Criteria**:
  - [ ] harness imports `ArchetypeRow`; no local `interface ArchetypeRow` in harness; `pnpm build` clean

  **QA Scenarios**:

  ```
  Scenario: Duplicate removed, build clean
    Tool: Bash
    Steps: 1) grep -n "interface ArchetypeRow" src/workers/opencode-harness.mts (expect none)  2) pnpm build
    Expected: no local interface; build clean
    Evidence: .sisyphus/evidence/task-5-dedup.txt
  ```

  **Commit**: YES — `refactor(workers): dedup ArchetypeRow` — Files: `src/workers/opencode-harness.mts` — Pre-commit: `pnpm build`

- [ ] 6. Wire World-A + World-B consumers to the single source

  **What to do**:
  - Use `lsp_find_references` on each contract-path literal + `EXECUTION_PROMPT` before editing.
  - World A → import from `src/lib/output-contract-constants.ts`: `output-contract.mts`, `delivery-phase.mts`, `opencode-harness.mts`, `harness-helpers.mts`, `execution-phase.mts`, `machine-provisioner.ts`, `delivery-retry.ts`, `admin-brain-preview.ts` (the EXECUTION_PROMPT copy).
  - World B → import from `src/worker-tools/lib/output-contract-paths.generated.ts`: `submit-output.ts`, `post-guest-approval.ts`.
  - Replace `EMPLOYEE_PHASE === 'delivery'` literals with the named constant in World A (`opencode-harness.mts`, `delivery-retry.ts`); World B `post-message.ts` uses the generated constant. Leave `TASK_PHASE` untouched.
  - Re-run golden + build — must stay GREEN (byte-identical).

  **Must NOT do**: Don't collapse env builders or unify critical-vars; don't touch `TASK_PHASE`; no value changes.

  **Recommended Agent Profile**: `deep`; Skills [`data-access-conventions`, `adding-shell-tools`].

  **Parallelization**: Wave 4 (with T7, T8, T9; coordinate file overlap with T10). Blocks T10, T13, F3. Blocked by T3, T4.

  **References**:
  - `src/workers/lib/output-contract.mts`, `opencode-harness.mts`, `harness-helpers.mts`, `delivery-phase.mts`, `src/inngest/lifecycle/lib/machine-provisioner.ts`, `src/inngest/lifecycle/steps/delivery-retry.ts`, `src/gateway/routes/admin-brain-preview.ts` (World A); `src/worker-tools/platform/submit-output.ts`, `src/worker-tools/slack/post-guest-approval.ts` (World B).
    **WHY**: Converts every scattered literal into a derived reference; golden guards no-behavior-change.

  **Acceptance Criteria**:
  - [ ] all listed consumers import from the constant modules
  - [ ] no raw `/tmp/summary.txt` / `/tmp/approval-message.json` literal remains outside the two constant modules (grep-verified)
  - [ ] golden + build GREEN

  **QA Scenarios**:

  ```
  Scenario: No stray path literals
    Tool: Bash
    Steps: 1) grep -rn "/tmp/summary.txt" src/ --include=*.ts --include=*.mts | grep -v "output-contract-constants" | grep -v "output-contract-paths.generated"  2) assert empty
    Expected: zero stray literals
    Evidence: .sisyphus/evidence/task-6-no-literals.txt
  Scenario: Golden + build green
    Tool: Bash
    Steps: 1) pnpm build  2) pnpm test:unit -- golden-prompts
    Expected: clean + GREEN
    Evidence: .sisyphus/evidence/task-6-green.txt
  ```

  **Commit**: YES — `refactor(workers): wire consumers to single output-contract source` — Files: (all listed) — Pre-commit: `pnpm build && pnpm test:unit -- golden-prompts`

- [ ] 7. Skill-registry from frontmatter

  **What to do**:
  - Create `src/lib/skill-registry.ts` reading each `src/workers/skills/*/SKILL.md` frontmatter (name + description) from disk (mirror the correct pattern in `admin-tools.ts`).
  - Replace the hardcoded skill list in `admin-brain-preview.ts` with a call to the registry. Do NOT touch the env-var inventory in that same file (separate surface, separate task scope).
  - `tests/unit/skill-registry.test.ts` verifies the registry returns on-disk skills.

  **Must NOT do**: Don't refactor the `admin-brain-preview.ts` env inventory; don't edit SKILL.md files here.

  **Recommended Agent Profile**: `unspecified-high`; Skills [`api-design`, `data-access-conventions`].

  **Parallelization**: Wave 4 (with T6, T8, T9). Blocks F2. Blocked by T1.

  **References**:
  - `src/gateway/routes/admin-tools.ts` — correct file-reading pattern; `src/gateway/routes/admin-brain-preview.ts` — hardcoded list to replace; `src/workers/skills/tool-usage-reference/SKILL.md` — example frontmatter.
    **WHY**: Skill name/description currently duplicated across frontmatter, AGENTS.md, and hardcoded route literals.

  **Acceptance Criteria**:
  - [ ] `skill-registry.ts` + test created; `admin-brain-preview.ts` uses it (no hardcoded skill literals)

  **QA Scenarios**:

  ```
  Scenario: Registry reads on-disk skills; route uses it
    Tool: Bash
    Steps: 1) pnpm test:unit -- skill-registry  2) grep -n "tool-usage-reference" src/gateway/routes/admin-brain-preview.ts (only registry call, no hardcoded description)
    Expected: PASS; route derives from registry
    Evidence: .sisyphus/evidence/task-7-skill.txt
  Scenario: New skill auto-discovered
    Tool: Bash
    Steps: 1) add temp src/workers/skills/zz-temp/SKILL.md  2) run registry test/one-liner  3) assert zz-temp appears  4) remove temp
    Expected: self-updating
    Evidence: .sisyphus/evidence/task-7-autodiscover.txt
  ```

  **Commit**: YES — `refactor(gateway): single-source skill registry from frontmatter` — Files: `src/lib/skill-registry.ts`, `src/gateway/routes/admin-brain-preview.ts`, `tests/unit/skill-registry.test.ts` — Pre-commit: `pnpm test:unit -- skill-registry`

- [ ] 8. `tool_registry` path-validation test (prerequisite for enforcement)

  **What to do**:
  - `tests/unit/tool-registry-paths.test.ts`: read every `tool_registry.tools[]` path from `prisma/seed.ts`, assert each `/tools/{service}/{name}.ts` maps to an existing file under `src/worker-tools/`. With T2's descriptors available, also assert each path corresponds to a tool that exports a `descriptor`.
  - If stale paths found, correct them in seed (fix typos/renames only — do NOT change which tools an employee uses).
  - This is validation only — enforcement is T12. But it is a HARD PREREQUISITE: T12 must not enable enforcement on any employee whose registry fails this test.

  **Must NOT do**: No runtime enforcement here; don't add/remove tools from any employee's registry.

  **Recommended Agent Profile**: `quick`; Skills [`creating-archetypes`].

  **Parallelization**: Wave 4 (with T6, T7, T9). Blocks T12. Blocked by T1, T2.

  **References**: `prisma/seed.ts` (tool_registry arrays); `src/worker-tools/` (filesystem); T2 descriptors.
  **WHY**: Zero validation today; a renamed tool silently breaks a registry. Enforcement (T12) is unsafe until registries are proven complete.

  **Acceptance Criteria**:
  - [ ] test created + PASS; any stale seed paths corrected

  **QA Scenarios**:

  ```
  Scenario: All registry paths resolve + have descriptors
    Tool: Bash
    Steps: 1) pnpm test:unit -- tool-registry-paths  2) assert PASS
    Expected: every path exists and maps to a descriptor
    Evidence: .sisyphus/evidence/task-8-paths.txt
  Scenario: Negative — fake path detected
    Tool: Bash
    Steps: 1) add "/tools/fake/x.ts" to a seed registry  2) run test → FAILS naming it  3) revert
    Expected: catches missing file
    Evidence: .sisyphus/evidence/task-8-negative.txt
  ```

  **Commit**: YES — `test(seed): validate tool_registry paths + descriptors` — Files: `tests/unit/tool-registry-paths.test.ts`, `prisma/seed.ts` (if stale) — Pre-commit: `pnpm test:unit -- tool-registry-paths`

- [ ] 9. env enforcement as a typed assertion over descriptors

  > **Oracle change**: replace the string-scanning env test with a type-checked assertion using T2 descriptors.

  **What to do**:
  - `tests/unit/env-enforcement.test.ts`: for every tool descriptor, take its `envVars`, and assert each PLATFORM var is in `PLATFORM_ENV_WHITELIST` (`src/repositories/tenant-env-loader.ts`). Enumerate exceptions explicitly: tenant secrets (`SLACK_BOT_TOKEN`, `HOSTFULLY_API_KEY`, `HOSTFULLY_AGENCY_UID`, `WEBHOOK_PUBLIC_URL`) and task-scoped vars injected per-task (`TASK_ID`, `TASK_TENANT_ID`, `TENANT_ID`, `NOTIFICATION_CHANNEL`, `EMPLOYEE_PHASE`).
  - Where a platform var is referenced but missing from `.env.example`, add it to `.env.example` + `.env` (both-files rule).

  **Must NOT do**: Don't add tenant secrets to the whitelist; don't convert `requireEnv` to `process.env`.

  **Recommended Agent Profile**: `unspecified-high`; Skills [`security`, `adding-shell-tools`].

  **Parallelization**: Wave 4 (with T6, T7, T8). Blocks F2. Blocked by T2.

  **References**:
  - `src/repositories/tenant-env-loader.ts:12-26` (`PLATFORM_ENV_WHITELIST`); tool descriptors (T2) as the env source; audit §5 (verified env inventory).
    **WHY**: A platform var missing from the whitelist is `undefined` in the container; descriptors make this a typed check instead of a fragile string scan.

  **Acceptance Criteria**:
  - [ ] `env-enforcement.test.ts` PASS; exceptions enumerated; any missing platform var added to `.env.example` + `.env`

  **QA Scenarios**:

  ```
  Scenario: Whitelist covers all platform descriptor envVars
    Tool: Bash
    Steps: 1) pnpm test:unit -- env-enforcement  2) assert PASS
    Expected: every platform var whitelisted
    Evidence: .sisyphus/evidence/task-9-env.txt
  Scenario: Negative — removing a whitelist entry fails
    Tool: Bash
    Steps: 1) remove OPENROUTER_API_KEY from whitelist  2) run test → FAILS  3) revert
    Expected: guard catches it
    Evidence: .sisyphus/evidence/task-9-negative.txt
  ```

  **Commit**: YES — `test(env): typed whitelist/descriptor parity` — Files: `tests/unit/env-enforcement.test.ts`, `.env.example`, `.env` (if vars added) — Pre-commit: `pnpm test:unit -- env-enforcement`

- [ ] 10. Generator prompt interpolation (Cluster E + A)

  **What to do**:
  - **Cluster E**: remove the inline duplicate of `CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE` in `archetype-generator-prompts.ts`; import the constant from `archetype-generator.ts`.
  - **Cluster A**: replace hardcoded contract-path/classification literals inside the generator prompt text with interpolation of the shared values from `src/lib/output-contract-constants.ts` (generator runs in World A). Interpolated text MUST be byte-identical — golden-guarded.
  - DEFER Clusters B (`step N` placeholder), D (Composio syntax), F (REFINE re-statement) — leave inline (guardrail).
  - Re-run `pnpm test:unit -- golden-prompts` — MUST stay byte-identical.

  **Must NOT do**: No touching B/D/F; no reword/reflow; no `EXEC_IMPORTANT` parameterization.

  **Recommended Agent Profile**: `deep`; Skills [`creating-archetypes`, `api-design`].

  **Parallelization**: Wave 5 (with T11). Blocks F3. Blocked by T3, T6.

  **References**:
  - `src/gateway/services/prompts/archetype-generator-prompts.ts` (Cluster A + E inline copies); `src/gateway/services/archetype-generator.ts` (`CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE`); `src/lib/output-contract-constants.ts` (shared values).
    **WHY**: The prompt re-states platform facts that now have a single home; interpolation removes the drift while golden guarantees identical LLM input.

  **Acceptance Criteria**:
  - [ ] Cluster E imported (no inline copy); Cluster A interpolated; B/D/F untouched; golden GREEN

  **QA Scenarios**:

  ```
  Scenario: Golden byte-identical after interpolation
    Tool: Bash
    Steps: 1) pnpm test:unit -- golden-prompts
    Expected: GREEN
    Evidence: .sisyphus/evidence/task-10-golden.txt
  Scenario: E deduped, D still inline
    Tool: Bash
    Steps: 1) grep inline override string gone  2) grep "list-actions.ts" still present (D deferred)
    Expected: E single-source; D unchanged
    Evidence: .sisyphus/evidence/task-10-clusters.txt
  ```

  **Commit**: YES — `refactor(generator): interpolate shared constants (cluster E+A)` — Files: `src/gateway/services/prompts/archetype-generator-prompts.ts` — Pre-commit: `pnpm test:unit -- golden-prompts`

- [ ] 11. Generate `tool-usage-reference/SKILL.md` from descriptors

  > Now sourced from T2 descriptors (not regex), preserving hand-written warnings.

  **What to do**:
  - Create `scripts/generate-tool-usage-skill.ts` that reads the tool descriptors (T2) and generates the CLI-syntax/flags/output BODY of `src/workers/skills/tool-usage-reference/SKILL.md`, preserving the hand-written warnings section below a sentinel `<!-- HAND-WRITTEN: DO NOT GENERATE BELOW -->`.
  - Add `package.json` script `generate-tool-usage-skill`. Insert the sentinel into the current SKILL.md, run the generator once, commit the result.
  - Add a CI gate in `deploy.yml`: `pnpm generate-tool-usage-skill && git diff --exit-code src/workers/skills/tool-usage-reference/SKILL.md` (no secret → hard gate).
  - `tests/unit/tool-usage-skill-sentinel.test.ts`: regeneration never overwrites content below the sentinel.

  **Must NOT do**: Don't delete the warnings; don't change composio skill generation.

  **Recommended Agent Profile**: `unspecified-high`; Skills [`adding-shell-tools`, `creating-archetypes`].

  **Parallelization**: Wave 5 (with T10, different files). Blocks F2. Blocked by T2.

  **References**:
  - T2 descriptors (source); `scripts/generate-composio-skills.ts` (codegen pattern); `.github/workflows/deploy.yml` (gate); `src/workers/skills/tool-usage-reference/SKILL.md` (split into generated body + sentinel warnings).
    **WHY**: The hand-written ~1034-line manual drifts from the tools; descriptor-driven generation closes the gap; sentinel preserves curated warnings.

  **Acceptance Criteria**:
  - [ ] generator script + `package.json` entry; SKILL.md regenerated with sentinel; CI gate added; sentinel test PASS

  **QA Scenarios**:

  ```
  Scenario: Regeneration idempotent + gate clean
    Tool: Bash
    Steps: 1) pnpm generate-tool-usage-skill  2) git diff --exit-code src/workers/skills/tool-usage-reference/SKILL.md
    Expected: exit 0
    Evidence: .sisyphus/evidence/task-11-gate.txt
  Scenario: Warnings preserved
    Tool: Bash
    Steps: 1) pnpm test:unit -- tool-usage-skill-sentinel  2) grep -A2 "HAND-WRITTEN: DO NOT GENERATE BELOW" SKILL.md
    Expected: PASS; warnings intact
    Evidence: .sisyphus/evidence/task-11-sentinel.txt
  ```

  **Commit**: YES — `feat(skills): generate tool-usage SKILL.md from descriptors` — Files: `scripts/generate-tool-usage-skill.ts`, `package.json`, `src/workers/skills/tool-usage-reference/SKILL.md`, `.github/workflows/deploy.yml`, `tests/unit/tool-usage-skill-sentinel.test.ts` — Pre-commit: `pnpm generate-tool-usage-skill && git diff --exit-code src/workers/skills/tool-usage-reference/SKILL.md`

- [ ] 12. `tool_registry` capability enforcement (flag-gated) — BEHAVIOR CHANGE

  > **Security boundary, opt-in.** Restricts which tools an employee can call to its declared `tool_registry`. INTENTIONALLY changes behavior — golden may need deliberate update; covered by live E2E. Prerequisite: T8 (registries validated) must be green.

  **What to do**:
  - Add a per-archetype boolean `enforce_tool_registry` (Prisma schema + migration; default `false`). Use the `prisma` skill; reload PostgREST schema cache after migration.
  - In the harness execution path, when the flag is ON, restrict the tools available to the OpenCode session to exactly the archetype's `tool_registry` (e.g. expose only those tool paths / wrap tool invocation with an allowlist check). When OFF, behavior is unchanged (all `/tools/` available) — this preserves every existing employee.
  - Log every denied attempt (tool id + archetype) for audit. Decide + document fail-closed (deny unknown) as the enforced-mode default.
  - Before enabling anywhere: validate/backfill registries for any archetype you flip ON (lean on T8). Do NOT flip ON existing production employees in this task — ship the mechanism OFF; enablement is a later operational step.
  - Tests: unit test that with the flag ON, a tool outside the registry is denied and one inside is allowed; with the flag OFF, all tools allowed (no regression).

  **Must NOT do**: Don't enable globally; don't enable on existing employees; don't break the OFF path.

  **Recommended Agent Profile**: `deep`; Skills [`prisma`, `inngest`, `security`].

  **Parallelization**: Wave 6 (with T13). Blocks F3. Blocked by T2, T8.

  **References**:
  - `src/workers/lib/execution-phase.mts` (reads `tool_registry` today as metadata — the enforcement point); `prisma/schema.prisma` (archetype model + new flag); T2 descriptors (tool ids); `prisma` skill (migration + schema-cache reload).
    **WHY**: Advisory tool_registry is a latent multi-tenant risk (a summarizer could invoke lock-rotation). Enforcement makes it a real capability boundary; flag-gating makes the rollout safe.

  **Acceptance Criteria**:
  - [ ] `enforce_tool_registry` flag added (default false, migration applied, schema cache reloaded)
  - [ ] flag ON → unauthorized tool denied + logged; authorized allowed; flag OFF → unchanged
  - [ ] no existing employee enabled in this task

  **QA Scenarios**:

  ```
  Scenario: Enforcement denies unauthorized tool (flag ON)
    Tool: Bash (unit) + live E2E in F3
    Steps: 1) pnpm test:unit -- tool-registry-enforce  2) assert allowed-in-registry passes, not-in-registry denied
    Expected: allowlist enforced only when flag ON
    Evidence: .sisyphus/evidence/task-12-enforce.txt
  Scenario: OFF path unchanged (no regression)
    Tool: Bash
    Steps: 1) test with flag false → all tools available
    Expected: identical to current behavior
    Evidence: .sisyphus/evidence/task-12-off.txt
  ```

  **Commit**: YES — `feat(security): flag-gated tool_registry capability enforcement` — Files: `prisma/schema.prisma`, `prisma/migrations/*`, `src/workers/lib/execution-phase.mts`, harness allowlist logic, `tests/unit/tool-registry-enforce.test.ts` — Pre-commit: `pnpm test:unit -- tool-registry-enforce`

- [ ] 13. Output-contract `version` field + harness compat check — BEHAVIOR CHANGE

  > Protects rolling deploys (old worker image ↔ new gateway). INTENTIONAL behavior change; covered by live E2E.

  **What to do**:
  - Add a `version` field (integer, start at 1) to the output-contract schema in `src/workers/lib/output-schema.mts` and have `submit-output.ts` (World B) write it. Define the constant version number in `src/lib/output-contract-constants.ts` (single source) and the World-B generated copy.
  - In the harness reader (`output-contract.mts`), read `version`; if absent, treat as v1 (backward compatible with already-written files); if newer-than-known, log a clear warning and degrade gracefully (do not crash). Document the compatibility policy (additive-only fields within a major version).
  - Tests: reader accepts a v1 file with no `version` field (legacy); reader accepts current version; reader handles an unknown-future version without throwing.

  **Must NOT do**: Don't break reading of legacy files (no version field); don't make version a hard reject.

  **Recommended Agent Profile**: `deep`; Skills [`data-access-conventions`].

  **Parallelization**: Wave 6 (with T12). Blocks F3. Blocked by T6.

  **References**:
  - `src/workers/lib/output-schema.mts` (StandardOutput schema); `src/worker-tools/platform/submit-output.ts` (writer); `src/workers/lib/output-contract.mts` (reader); `src/lib/output-contract-constants.ts` (version constant single source).
    **WHY**: At scale with rolling deploys, a new gateway reading an old worker's contract (or vice versa) is a real failure mode; a version field + graceful handling prevents silent breakage.

  **Acceptance Criteria**:
  - [ ] `version` written by submit-output; read + range-checked by harness; legacy (no field) treated as v1; unknown-future degrades gracefully
  - [ ] version constant defined once in `src/lib/` + flows to generated World-B copy

  **QA Scenarios**:

  ```
  Scenario: Legacy + current + future versions handled
    Tool: Bash (unit) + live E2E in F3
    Steps: 1) pnpm test:unit -- output-contract-version  2) assert: no-version→v1 ok; current ok; future→warn not throw
    Expected: backward + forward tolerant
    Evidence: .sisyphus/evidence/task-13-version.txt
  ```

  **Commit**: YES — `feat(contract): add output-contract version + harness compat` — Files: `src/workers/lib/output-schema.mts`, `src/worker-tools/platform/submit-output.ts`, `src/workers/lib/output-contract.mts`, `src/lib/output-contract-constants.ts`, `scripts/generate-worker-constants.ts`, `tests/unit/output-contract-version.test.ts` — Pre-commit: `pnpm test:unit -- output-contract-version`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents in PARALLEL. ALL must APPROVE. Present results; get explicit user okay before completing. Never check F1–F4 before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Verify each "Must Have" exists (read file / run test). Verify each "Must NOT Have" absent (grep: no sync-test-pair where generation exists; no request-time disk read in handlers; no EMPLOYEE_PHASE/TASK_PHASE merge; enforcement flag defaults OFF; no deprecated-file edits). Confirm generated artifacts have `// @generated` headers and CI diff gates. Confirm enforcement was preceded by registry validation/backfill.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review for `as any`/`@ts-ignore`, empty catches, dead code. Verify `discoverTools()` no longer regex-scans (typed aggregation) and is startup-cached. Verify both CI diff gates pass.
      Output: `Build|Lint|Tests|Gates | VERDICT`

- [ ] F3. **Live E2E** — `unspecified-high`
      `docker build -t ai-employee-worker:latest .`. Re-run `pnpm test:unit -- golden` (GREEN for drift tasks). Trigger `real-estate-motivation-bot-2` (model `deepseek/deepseek-v4-flash`): verify `tasks.status = Done` via PostgREST + `task_status_log` + `/tmp/summary.txt`. **Enforcement check**: with the flag ON for a test archetype, attempt a tool NOT in its registry → confirm it is BLOCKED and logged, while an authorized tool succeeds. **Versioning check**: simulate a contract written with an older/newer `version` → confirm harness handles it gracefully (no crash). Evidence → `.sisyphus/evidence/final-qa/`.
      Output: `Docker|Golden|Task=Done(id)|Enforcement blocked unauthorized|Version mismatch handled | VERDICT`

- [ ] F4. **Scope Fidelity** — `deep`
      Per task: spec vs diff 1:1. Confirm drift tasks are byte-identical (golden) and only T12/T13 changed behavior (with deliberate golden updates). No creep into deferred clusters B/D/F or backlog items. No cross-task contamination. No deprecated-file edits.
      Output: `Tasks [N/N] | Contamination [CLEAN/N] | VERDICT`

---

## Post-Verification (after F1–F4 APPROVE + user okay)

- [ ] T14. **Documentation updates** — `writing`
      Update `AGENTS.md` + `README.md`: the `src/lib/output-contract-constants.ts` single source; the generate-not-sync World-B pattern (`// @generated`); typed `ToolDescriptor` + startup-cached discovery; `src/lib/skill-registry.ts`; capability-enforcement flag + semantics; output-contract `version` field. Add the drift-audit doc to reference tables. Record the backlog items (AGENTS.md typed schema, versioned prompt templates) as future work. No volatile counts.
      **QA**: `grep -c "output-contract-constants\|ToolDescriptor\|capability\|version" AGENTS.md` ≥ 4. Evidence: `.sisyphus/evidence/task-14-docs.txt`.
      **Commit**: `docs(agents): document single-source + capability + versioning conventions`

- [ ] T15. **Notify completion** — `quick`
      `tsx scripts/telegram-notify.ts "✅ Single-source-of-truth + scale-hardening complete — drift eliminated, typed discovery, capability enforcement + contract versioning live, E2E passed. Come back to review."`
      **Commit**: NO

---

## Success Criteria

```bash
pnpm test:unit -- golden                                   # PASS (drift tasks byte-identical)
pnpm generate-worker-constants && git diff --exit-code     # clean
pnpm generate-tool-usage-skill && git diff --exit-code     # clean
pnpm test:unit -- "tool-descriptors|env-enforcement|tool-registry-paths|skill-registry"  # PASS
pnpm build && pnpm lint                                     # PASS
```

- [ ] All Must Have present; all Must NOT Have absent
- [ ] Live E2E: employee Done + unauthorized tool blocked + version mismatch handled
