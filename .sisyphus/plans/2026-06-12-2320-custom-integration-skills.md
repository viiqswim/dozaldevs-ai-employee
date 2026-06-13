# Custom Integration Skills for AI Employees (tenant-filtering layer)

## TL;DR

> **Quick Summary**: The recent single-source-and-scale-architecture refactor already gave AI employees auto-generated, always-accurate tool docs (one shared `tool-usage-reference` SKILL.md generated from the `ALL_TOOL_DESCRIPTORS` registry). The ONE thing custom integrations still lack vs Composio is **tenant-filtering** — every employee currently sees every custom tool, even for services its workspace can't use. This plan adds that filtering layer (generated from the SAME registry — no new source of truth) plus the still-valid cleanups the refactor did not address.
>
> **Deliverables**:
>
> - Per-service skill folders (`hostfully`, `sifely`, `github`, `slack`, `knowledge-base`, `platform`) generated FROM `ALL_TOOL_DESCRIPTORS` (single source preserved) via an extension of the existing generation pipeline
> - `loadCustomIntegrations(tenantId)` worker-side tenant detection
> - `filterCustomSkills(connectedServices)` boot-time filter wired into BOTH execution and delivery phases (mirrors `filterComposioSkills`)
> - `## Custom Integrations` section in the compiled AGENTS.md (mirrors Composio's Connected Apps section)
> - Fix wizard `refine()` blindness (still unfixed by the refactor)
> - Fix the STALE hand-written `/tools/locks/` Sifely paths below the SKILL.md sentinel
> - Decouple `admin-tools.ts` + `admin-brain-preview.ts` tool-enrichment from `parseSkillMd(monolith)` (use the descriptor registry)
> - CI freshness check for the new per-service skills; docs
>
> **Estimated Effort**: Medium (≈half the original — the refactor already built the generation half)
> **Parallel Execution**: YES — 4 waves + final
> **Critical Path**: W1 cleanups → W2 generator-extension + detection + filter → W2 commit → W3 CI + AGENTS.md section + endpoint decouple → W4 rebuilt-container + live verification

---

## Context

### Original Request

Make AI employees fully aware of CUSTOM-code integrations (Hostfully, Sifely, GitHub, Slack custom tools, knowledge_base, platform) the same way they already are for Composio apps — tenant-filtered, lazy-loaded skills flowing into BOTH execution and delivery phases.

### CRITICAL: Reconciliation with the single-source-and-scale-architecture refactor

A large refactor (`.sisyphus/plans/2026-06-12-1810-single-source-and-scale-architecture.md`, see also `docs/guides/2026-06-12-2030-drift-audit.md`) landed AFTER the original research for this plan. It changed the landscape and **already built the generation half** of this work. Verified current state (3 agents, 2026-06-12 evening):

| Prior assumption (now stale)                                                      | Verified reality                                                                                                                                                                                                                                                                                          | Effect on this plan                                                                   |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tool-usage-reference/SKILL.md` is a hand-maintained 1034-line monolith to DELETE | It is GENERATED above a sentinel `<!-- HAND-WRITTEN: DO NOT GENERATE BELOW -->` from `ALL_TOOL_DESCRIPTORS` via `scripts/generate-tool-usage-skill.ts` (`pnpm generate-tool-usage-skill`), with a CI gate at `deploy.yml:59-65`. Below the sentinel: 5 hand-written warnings + detailed per-service docs. | DO NOT delete. DO NOT build a parallel generator. REUSE this pipeline + the registry. |
| `discoverTools()` regex-scans dirs and leaks `_template/`/`__tests__/`            | `discoverTools()` now maps the static `ALL_TOOL_DESCRIPTORS` (`src/lib/tool-registry.ts`), startup-cached, no `fs.readdir`. Leak is structurally impossible (also fixes the Dockerfile.gateway COPY prod bug).                                                                                            | DROP the discoverTools exclusion task — MOOT.                                         |
| `tool_registry` is a dead field                                                   | `enforce_tool_registry Boolean @default(false)` (`schema.prisma:205`) + `isToolAllowed()` (`execution-phase.mts:74-84`, runtime-enforced ~210-223).                                                                                                                                                       | Keep enforcement OUT of scope, but it is no longer "dead" — rationale updated.        |
| Both gateway endpoints fully coupled to the monolith                              | `admin-brain-preview.ts` skills LIST already decoupled (`getWorkerSkills()` line 332). BUT both `admin-tools.ts` (20,30,54) AND `admin-brain-preview.ts` (304-309) STILL call `parseSkillMd(tool-usage-reference/SKILL.md)` for TOOL ENRICHMENT.                                                          | Narrow the decouple tasks to enrichment-only.                                         |
| Stale `/tools/locks/sifely-client.ts` Sifely paths everywhere                     | The GENERATED section is correct (`sifely/...`). The HAND-WRITTEN section below the sentinel (~lines 858-1355) + the frontmatter description are still stale.                                                                                                                                             | Fix = EDIT the hand-written section, not delete-and-regenerate.                       |
| Wizard `refine()` is blind to tools/composio                                      | STILL blind (`archetype-generator.ts:373` uses static `REFINE_SYSTEM_PROMPT`). The refactor did not fix it.                                                                                                                                                                                               | Task STAYS VALID.                                                                     |

**Net effect**: The refactor already delivered the "generated, always-accurate, single-source tool docs" half. This plan now ONLY adds the **tenant-filtering layer** (the one thing Composio has that custom tools don't) + the genuinely-unaddressed cleanups.

### Key Decisions (user-confirmed)

- **Single source preserved**: per-service skills are GENERATED from the same `ALL_TOOL_DESCRIPTORS` registry — NOT a new hand-maintained source. The existing `tool-usage-reference` generated skill stays as-is (always-on).
- **Tenant-filtering layer** (the gap): per-service skill folders, filtered at boot by a NEW `filterCustomSkills()` (explicit allowlist), with `knowledge-base` + `platform` + `tool-warnings`-equivalent always kept.
- **Full mirror of Composio**: include the `## Custom Integrations` AGENTS.md section too.
- **Slack via Composio is DISABLED** → Slack detection = `slack_bot_token` secret only (no hybrid OR-logic).
- **Excluded (locked)**: `tool_registry` runtime enforcement changes; any edit to the Composio generator / `composio-*` folders / `filterComposioSkills`; the existing `generate-tool-usage-skill` generator's behavior; adding new tools; renaming `/tools/knowledge_base/` dir; deleting `tool-usage-reference`.

### Metis Review (from original session, still applicable to the retained tasks)

- The two endpoint consumers must BOTH be handled (admin-tools.ts + admin-brain-preview.ts) — now narrowed to the `parseSkillMd` enrichment coupling.
- Generator service list and filter allowlist must stay in sync (invariant test).
- Zero-secret tenant must still get the always-keep skills so `submit-output` is reachable and the task reaches `Done`.
- Rebuild-required hard gate: skill changes have zero effect until `docker build`; verify in a rebuilt container + a live employee task.

---

## Work Objectives

### Core Objective

Add tenant-scoped filtering of custom-tool skills — generated from the single `ALL_TOOL_DESCRIPTORS` source, injected into both the execution and delivery phases (skill folders + an AGENTS.md section) — so each employee sees only the custom services its workspace is connected to, while preserving the recently-built single-source generation pipeline and closing the cleanups the refactor left open.

### Concrete Deliverables

- An extension of the existing generation pipeline that emits per-service skill folders `src/workers/skills/{hostfully,sifely,github,slack,knowledge-base,platform}/` from `ALL_TOOL_DESCRIPTORS` (deterministic; reuse `writeIfChanged`/LF helpers), wired into a single umbrella `pnpm generate-skills` command (reference + per-service + Composio-when-keyed)
- `loadCustomIntegrations(tenantId)` + `filterCustomSkills(connectedServices)` in worker libs, called in both phases after `filterComposioSkills`
- `## Custom Integrations` AGENTS.md section in `compileAgentsMd()`
- `refine()` tool-catalog + composio awareness fix
- Corrected hand-written Sifely section + frontmatter under the SKILL.md sentinel
- `admin-tools.ts` + `admin-brain-preview.ts` tool-enrichment sourced from the descriptor registry (no `parseSkillMd(monolith)`)
- CI freshness check for the per-service skills; AGENTS.md + README docs

### Definition of Done

- [ ] A Hostfully-only tenant exposes `hostfully/`, `knowledge-base/`, `platform/` (+always-keep) and NOT `sifely/`/`github/`/`slack/` in-container; `composio-*` and `tool-usage-reference` untouched
- [ ] A zero-secret tenant still has the always-keep skills and its task reaches `Done`
- [ ] `pnpm generate-skills` is idempotent for the descriptor-driven parts; generated FROM `ALL_TOOL_DESCRIPTORS` (no second source)
- [ ] `refine()` no longer invents tool paths
- [ ] No stale `/tools/locks/` reference remains in `tool-usage-reference/SKILL.md`; `pnpm generate-tool-usage-skill` still green
- [ ] `GET /admin/tools` + brain-preview return 200 with descriptor-sourced enrichment (no `parseSkillMd` of the monolith)
- [ ] CI fails when committed custom skills are stale
- [ ] Verified in a REBUILT container + a live employee task

### Must Have

- Per-service skills generated FROM `ALL_TOOL_DESCRIPTORS` (single source; no new authoritative source)
- `filterCustomSkills()` — explicit allowlist, case-insensitive, never-throws, never touches `composio-*`/`tool-usage-reference`/`uuid-disambiguation`
- always-keep set: knowledge-base, platform (+ existing always-on `tool-usage-reference`/`uuid-disambiguation` untouched)
- `## Custom Integrations` AGENTS.md section
- BOTH endpoints' enrichment decoupled from `parseSkillMd(monolith)`
- CI freshness check for the new skills

### Must NOT Have (Guardrails)

- NO deletion of `tool-usage-reference/SKILL.md` (it is generated + hand-written hybrid now)
- NO `discoverTools()` exclusion task (MOOT — static registry)
- NO new parallel/duplicate tool-doc generator or second source of truth — generate FROM `ALL_TOOL_DESCRIPTORS`
- NO edit to `filterComposioSkills`, the Composio generator, any `composio-*` folder, or the existing `generate-tool-usage-skill` generator behavior
- NO `tool_registry` runtime-enforcement changes
- NO Slack-via-Composio detection branch (`slack_bot_token` secret only)
- NO prefix-match filtering (explicit allowlist only)
- NO new tools; NO renaming `/tools/knowledge_base/` dir
- NO cron/timer/background regeneration; NO per-task generation
- NO "verified from code" for skill filtering or live tasks — rebuilt container + live employee required

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest unit `tests/unit/`, integration `tests/integration/` vs `ai_employee_test`); golden-prompt fixtures exist (`pnpm test:unit -- golden-prompts`) — keep them GREEN when touching `refine()`.
- **Automated tests**: Tests-after — unit for generator-extension/detection/filter/name-mapping/list-sync; integration for PostgREST detection.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence → `.sisyphus/evidence/custom-skills/task-{N}-{slug}.{ext}`.

- **Generator/scripts**: Bash — run script, assert files + idempotent git diff
- **Detection**: integration test against `ai_employee_test`
- **Filter**: vitest unit on a temp skills dir + container `ls`
- **Endpoints**: `curl` with exact status + JSON assertions
- **refine()**: golden-prompt fixtures stay green; unit asserts catalog present in refine prompt
- **Container/skill**: `docker build` then `docker run --rm ai-employee-worker:latest ls /app/.opencode/skills/`; live task via the `Skills available in container` log line
- **Live**: feature-verification on guest-messaging (lead_uid/thread_uid) + real-estate-motivation-bot-2 smoke

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — independent cleanups + the shared path-derivation foundation):
├── Task 1: Fix wizard refine() blindness (tool catalog + composio) [deep]
├── Task 2: Derive tool invocation paths from the registry + strip stale hand-typed paths [unspecified-high]
└── Task 3: Decouple admin-tools.ts + admin-brain-preview.ts tool-enrichment from parseSkillMd(monolith) [unspecified-high]

Wave 2 (After Wave 1 — the tenant-filtering layer, generated from the single source):
├── Task 4: Per-service skill generator (FROM ALL_TOOL_DESCRIPTORS) + shared path helper + name mapping (needs T2) [deep]
├── Task 5: umbrella pnpm generate-skills command (reference + per-service + composio) + COMMIT (needs T4) [deep]
├── Task 6: loadCustomIntegrations() worker detection [unspecified-high]
└── Task 7: filterCustomSkills() + wire into both phases + list-sync invariant [unspecified-high]

Wave 3 (After Wave 2 commit — discoverability + CI):
├── Task 8: ## Custom Integrations AGENTS.md section in compileAgentsMd [unspecified-high]
└── Task 9: CI freshness check for custom skills [unspecified-high]

Wave 4 (Verification — rebuilt container + live employees):
└── Task 10: LIVE E2E — rebuild image, container skill-filter proof, live employee tasks [unspecified-high]

Wave 5 (Docs + notify):
├── Task 11: Docs — AGENTS.md + README [writing]
└── Task 12: Notify completion [quick]

Wave FINAL (4 parallel reviews → user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Live E2E evidence audit (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T1/T3 → T4 → T5 → (T6,T7) → T8/T9 → T10 → F1-F4 → user okay
Max Concurrent: 4
```

### Dependency Matrix

- **1**: deps none → blocks Final (golden-prompts must stay green)
- **2**: deps none → blocks 4 (shared `toolInvocationPath` helper), 5
- **3**: deps none → blocks 10
- **4**: deps 2 (reuses the shared path helper) → blocks 5
- **5**: deps 4, 2 → blocks 6-handoff, 7, 8, 9
- **6**: deps none → blocks 7, 8
- **7**: deps 5 (skills exist), 6 → blocks 10
- **8**: deps 6 → blocks 10
- **9**: deps 5 → blocks Final
- **10**: deps 1-9 → blocks 11, Final
- **11**: deps 10 → blocks 12
- **12**: deps 11 → blocks Final

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep` (+creating-archetypes, +api-design), T2 → `unspecified-high`, T3 → `unspecified-high` (+api-design)
- **Wave 2**: T4 → `deep` (+adding-shell-tools), T5 → `deep`, T6 → `unspecified-high` (+data-access-conventions), T7 → `unspecified-high`
- **Wave 3**: T8 → `unspecified-high`, T9 → `unspecified-high`
- **Wave 4**: T10 → `unspecified-high` (+e2e-testing, +feature-verification, +debugging-lifecycle)
- **Wave 5**: T11 → `writing` (+writing-guidelines), T12 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+feature-verification), F4 → `deep`

---

## TODOs

> Implementation + Test = ONE task. EVERY task has a Recommended Agent Profile, Parallelization info, References, and QA Scenarios.

- [x] 1. Fix wizard `refine()` blindness — inject tool catalog + composio context

  **What to do**:
  - Widen `ArchetypeGenerator.refine(...)` (`src/gateway/services/archetype-generator.ts`) to accept and inject the same tool catalog + composio context `generate()` uses, so refinements reference ONLY real tool paths and connected apps. `generate()` builds this via `buildSystemPrompt(connectedToolkits, connectableToolkits)` (which calls `discoverTools()` → the `ALL_TOOL_DESCRIPTORS`-backed catalog). `refine()` currently uses the static `REFINE_SYSTEM_PROMPT` with neither.
  - In `src/gateway/routes/admin-archetype-generate.ts`, pass the tool catalog + `connectedToolkits` + `connectableToolkits` into the `refine()` call (today it passes only the model catalog for recommendation).
  - Reuse existing helpers (`formatToolCatalog()`/`buildConnectedAppsBlock()`); do not duplicate logic.

  **Must NOT do**:
  - Do NOT change `generate()` behavior. Do NOT rewrite the wizard UI. Do NOT alter the descriptor registry.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`creating-archetypes`, `api-design`]

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: Final · Blocked By: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:361-394` — `refine()` (uses static `REFINE_SYSTEM_PROMPT` at ~373); `:329-358` — `generate()` calls `buildSystemPrompt()` (the pattern to mirror)
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:301` — `REFINE_SYSTEM_PROMPT`; `buildConnectedAppsBlock()`
  - `src/gateway/routes/admin-archetype-generate.ts:99-103` — refine call site (only model catalog today)
  - `src/lib/tool-registry.ts` — `ALL_TOOL_DESCRIPTORS` (the catalog source behind `discoverTools()`)
  - Golden fixtures: `pnpm test:unit -- golden-prompts` — MUST stay green (the refactor added these to guard prompt byte-identity; expect the `REFINE_SYSTEM_PROMPT` fixture to change intentionally — update its golden baseline as part of this task)

  **Acceptance Criteria**:
  - [ ] `refine()` injects tool catalog + connected/connectable toolkits into its prompt
  - [ ] A refine for a tenant with `notion` connected keeps `execute.ts --toolkit notion` valid and introduces no non-existent tool paths
  - [ ] `golden-prompts` updated intentionally and green; `pnpm test:unit` + `pnpm build` clean

  **QA Scenarios**:

  ```
  Scenario: Refine no longer hallucinates tool paths
    Tool: Bash (curl + jq)
    Preconditions: tenant with notion connected
    Steps:
      1. Generate an archetype, then call the refine path with a tool-implying instruction
      2. Assert refined execution_steps reference only paths in discoverTools() output (+ composio execute.ts)
    Expected Result: no invented tool paths
    Evidence: .sisyphus/evidence/custom-skills/task-1-refine.txt

  Scenario: Refine prompt contains the catalogs + golden stays green
    Tool: Bash (vitest)
    Steps:
      1. Unit-test asserts '## Available Tools' + connected-apps block present in the refine prompt
      2. pnpm test:unit -- golden-prompts → green (baseline updated intentionally)
    Expected Result: catalogs present; golden green
    Evidence: .sisyphus/evidence/custom-skills/task-1-prompt.txt
  ```

  **Commit**: YES — `fix(wizard): make archetype refine() aware of tool catalog and connected apps`

- [x] 2. Derive tool command paths from the registry (kill stale paths at the source)

  **What to do**:
  - The stale `/tools/locks/sifely-client.ts` paths exist ONLY because the GENERATED section of `tool-usage-reference/SKILL.md` (rendered by `scripts/generate-tool-usage-skill.ts`) does NOT emit the literal invocation path — so every command path is hand-typed in the hand-written zone below the sentinel and drifts. The command path is fully derivable: it is always `tsx /tools/<service>/<id>.ts`, and both `service` and `id` are already in every `ToolDescriptor`.
  - Modify `renderTool()` in `scripts/generate-tool-usage-skill.ts` to emit an `**Invocation**: \`tsx /tools/<service>/<id>.ts [flags]\`` line per tool, derived from the descriptor. This makes the canonical command path single-sourced and impossible to go stale on rename/move.
  - Then STRIP the now-redundant hand-typed command paths from the hand-written zone (below the sentinel): remove the stale `tsx /tools/locks/sifely-client.ts --action ...` monolithic block and every `/tools/locks/` path, and rely on the generated `**Invocation**` lines for paths. KEEP the genuinely human content that is NOT in the registry: output-shape examples, worked examples, and the 5 tribal warnings. Fix the frontmatter `description` (line ~3) `/tools/locks/` → `/tools/sifely/`.
  - Regenerate (`pnpm generate-tool-usage-skill`) and commit. The CI gate at `deploy.yml:59-65` must stay green.

  > NOTE: Q1 decision = derive command paths from the registry (do NOT also move output-shapes/examples into the descriptor — that is a deliberate non-goal for this plan). The same `**Invocation**` derivation is REUSED by the per-service generator (Task 4) so both share one path-rendering rule.

  **Must NOT do**:
  - Do NOT hand-type any `tsx /tools/...` path into the hand-written zone (that reintroduces the drift). Do NOT change the descriptor schema (no new fields). Do NOT delete the file. Do NOT remove the 5 tribal warnings or the real output-shape/example prose.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 4, 5 · Blocked By: None

  **References**:
  - `scripts/generate-tool-usage-skill.ts:94-115` — `renderTool()` (add the derived `**Invocation**` line here); `:117-140` — `buildGeneratedSection()`
  - `src/lib/tool-registry.ts:8-14` — `ToolDescriptor` has `service` + `id` (the path is `tsx /tools/<service>/<id>.ts`)
  - `src/workers/skills/tool-usage-reference/SKILL.md:335` — sentinel; hand-written zone below it holds the stale `/tools/locks/` paths; `:3` — stale frontmatter
  - `src/worker-tools/sifely/*.ts` — confirms real path shape `/tools/sifely/<id>.ts`
  - `.github/workflows/deploy.yml:59-65` — CI gate that must stay green

  **Acceptance Criteria**:
  - [ ] Generated section now emits an `**Invocation**: tsx /tools/<service>/<id>.ts` line for every tool, derived from the descriptor
  - [ ] No `/tools/locks/` or `sifely-client.ts` reference remains anywhere in the SKILL.md or frontmatter
  - [ ] No hand-typed `tsx /tools/...` path remains in the hand-written zone (paths come only from the generated section)
  - [ ] 5 tribal warnings + output-shape/example prose preserved
  - [ ] `pnpm generate-tool-usage-skill && git diff --exit-code` clean after commit (idempotent)

  **QA Scenarios**:

  ```
  Scenario: Paths are generated, not hand-typed; stale paths gone
    Tool: Bash (grep)
    Steps:
      1. grep -n "/tools/locks/\|sifely-client.ts" src/workers/skills/tool-usage-reference/SKILL.md || echo NONE
      2. Assert NONE
      3. grep -c "**Invocation**: \`tsx /tools/" SKILL.md ; assert >= number of descriptors
    Expected Result: zero stale paths; one generated invocation line per tool
    Evidence: .sisyphus/evidence/custom-skills/task-2-paths.txt

  Scenario: Rename-safety — a moved tool can't go stale
    Tool: Bash (vitest)
    Steps:
      1. Unit-test renderTool() with a descriptor {service:'sifely', id:'list-locks'} → asserts output contains 'tsx /tools/sifely/list-locks.ts'
      2. Change id → asserts path tracks the descriptor automatically
    Expected Result: path always derived from descriptor
    Evidence: .sisyphus/evidence/custom-skills/task-2-derive.txt

  Scenario: Generator idempotent + CI green
    Tool: Bash
    Steps:
      1. pnpm generate-tool-usage-skill ; commit ; run again
      2. git diff --exit-code src/workers/skills/tool-usage-reference/SKILL.md
    Expected Result: exit 0; warnings + examples preserved
    Evidence: .sisyphus/evidence/custom-skills/task-2-generator.txt
  ```

  **Commit**: YES — `feat(skills): derive tool invocation paths from registry, remove stale hand-typed paths`

- [x] 3. Decouple tool-enrichment in `admin-tools.ts` + `admin-brain-preview.ts` from `parseSkillMd(monolith)`

  **What to do**:
  - In `src/gateway/routes/admin-tools.ts`, remove the `parseSkillMd(tool-usage-reference/SKILL.md)` + `enrichTools()` coupling (module-level `skillPath` const ~line 20; calls at ~30 and ~54). Source tool metadata from the descriptor registry (`discoverTools()` / `ALL_TOOL_DESCRIPTORS`) alone — descriptors already carry description/env/args, so enrichment from the monolith is no longer needed. Preserve response shape + status; use `sendSuccess`/`sendError`.
  - In `src/gateway/routes/admin-brain-preview.ts`, do the same to the tool-enrichment block (~lines 304-309). The skills LIST there already uses `getWorkerSkills()` (line 332) — leave that untouched.

  **Must NOT do**:
  - Do NOT delete the monolith. Do NOT change `getWorkerSkills()` usage. Do NOT change route paths/auth. Do NOT build a tenant-aware filter in the gateway.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`api-design`]

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 10 · Blocked By: None

  **References**:
  - `src/gateway/routes/admin-tools.ts:20,30,54` — `parseSkillMd(skillPath)` coupling to remove
  - `src/gateway/routes/admin-brain-preview.ts:304-309` — same enrichment coupling; `:332` — `getWorkerSkills()` (leave as-is)
  - `src/lib/tool-registry.ts` `ALL_TOOL_DESCRIPTORS` + `src/gateway/services/tool-parser.ts` `discoverTools()` — the retained source
  - `src/gateway/lib/http-response.ts` — `sendSuccess`/`sendError`

  **Acceptance Criteria**:
  - [ ] Neither route reads `tool-usage-reference/SKILL.md`; `grep -n "tool-usage-reference" src/gateway/routes/admin-tools.ts src/gateway/routes/admin-brain-preview.ts` → none
  - [ ] `GET /admin/tools` returns 200 with `tools.length >= 30` and descriptions present (from descriptors)
  - [ ] brain-preview route returns 200; `skills` list unchanged (still `getWorkerSkills()`)

  **QA Scenarios**:

  ```
  Scenario: Endpoints work from descriptors, no monolith read
    Tool: Bash (curl + jq + grep)
    Steps:
      1. grep -n "parseSkillMd" src/gateway/routes/admin-tools.ts src/gateway/routes/admin-brain-preview.ts → none
      2. curl GET /admin/tools (bearer) → 200, tools.length>=30, each has a description
      3. curl brain-preview route → 200, skills[] still present
    Expected Result: descriptor-sourced enrichment; no monolith coupling
    Evidence: .sisyphus/evidence/custom-skills/task-3-endpoints.txt
  ```

  **Commit**: YES — `refactor(api): source tool enrichment from descriptor registry, drop monolith coupling`

- [x] 4. Per-service skill generator core (FROM `ALL_TOOL_DESCRIPTORS`) + shared path derivation + service→skill-name mapping

  **What to do**:
  - Build `src/lib/custom-skills/skill-generator.ts`. Given a service name + the descriptors for that service (filtered from `ALL_TOOL_DESCRIPTORS`), render a skill folder in memory: a `SKILL.md` (frontmatter `name` = mapped skill name; ultra-specific `description` so it loads only when that service is relevant; an index of the service's tools + one-line purpose each) and one `actions/<tool>.md` per tool (full CLI contract from the descriptor: invocation path, args, env, purpose). **Source = `ALL_TOOL_DESCRIPTORS` ONLY** — no directory scan, no `--help` parsing, no second source of truth.
  - **Reuse the SAME invocation-path derivation from Task 2** (`tsx /tools/<service>/<id>.ts`). Extract it to a tiny shared helper (e.g. `toolInvocationPath(descriptor)` in `src/lib/tool-registry.ts` or a sibling) so BOTH `generate-tool-usage-skill.ts` and this per-service generator render paths from one rule — a renamed tool updates everywhere, no drift.
  - Implement a tested `serviceToSkillName(service)`: `knowledge_base` → `knowledge-base`; all other services pass through unchanged; assert output matches `^[a-z0-9]+(-[a-z0-9]+)*$` (no `_`). Per Q2, the `/tools/knowledge_base/` directory stays snake_case (intentional, AGENTS.md-mandated, matches the container path tools depend on); ONLY the skill folder name is kebab via this one-line mapping.
  - Pure render (no disk/DB writes here). Return `{ skillMd, actionFiles }`.

  **Must NOT do**:
  - Do NOT scan the filesystem or parse `--help`/JSDoc. Do NOT write to disk/DB. Do NOT generate for services absent from `ALL_TOOL_DESCRIPTORS`. Do NOT rename the `knowledge_base` directory. Do NOT re-implement path derivation independently — share it with Task 2.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**: Can Run In Parallel: NO (reuses Task 2's path helper) · Wave 2 · Blocks: 5 · Blocked By: 2

  **References**:
  - `src/lib/tool-registry.ts` — `ALL_TOOL_DESCRIPTORS` + `ToolDescriptor` (the ONLY source) + the shared `toolInvocationPath()` helper (from/with Task 2)
  - `scripts/generate-tool-usage-skill.ts:94-140` — `renderTool()`/`buildGeneratedSection()` (the rendering + path pattern to share)
  - `src/workers/skills/composio-notion/SKILL.md` + `actions/` — target folder format
  - AGENTS.md § "knowledge_base uses snake_case intentionally" — dir stays snake; skill folder is kebab

  **Acceptance Criteria**:
  - [ ] Unit test: given the `hostfully` descriptors, returns a `SKILL.md` indexing each tool + one `actions/<tool>.md` per tool with invocation path + args + env
  - [ ] Invocation paths come from the SHARED `toolInvocationPath()` helper (same one Task 2 uses) — asserted by a test that both renderers produce the same path for a given descriptor
  - [ ] `serviceToSkillName('knowledge_base')` === `'knowledge-base'`; no output folder name contains `_`
  - [ ] Reads ONLY `ALL_TOOL_DESCRIPTORS` (no `fs.readdir`, no `--help` parsing)

  **QA Scenarios**:

  ```
  Scenario: Renders index + per-tool action files from descriptors with shared paths
    Tool: Bash (vitest)
    Steps:
      1. Unit test sourcing the real hostfully descriptors from ALL_TOOL_DESCRIPTORS
      2. Assert skillMd indexes each tool; actionFiles has one per tool with the invocation path from toolInvocationPath()
      3. Assert the path matches what generate-tool-usage-skill renders for the same descriptor
    Expected Result: index + N action files; paths single-sourced
    Evidence: .sisyphus/evidence/custom-skills/task-4-render.txt

  Scenario: Name mapping enforces kebab, no underscore (dir unchanged)
    Tool: Bash (vitest)
    Steps:
      1. Assert serviceToSkillName('knowledge_base') === 'knowledge-base'
      2. Assert every generated folder name matches ^[a-z0-9]+(-[a-z0-9]+)*$
      3. Assert src/worker-tools/knowledge_base/ still exists (dir not renamed)
    Expected Result: valid kebab skill names; dir untouched
    Evidence: .sisyphus/evidence/custom-skills/task-4-naming.txt
  ```

  **Commit**: YES — `feat(custom-skills): per-service skill generator with shared registry-derived paths`

- [x] 5. Single umbrella `pnpm generate-skills` command (reference + per-service + Composio) + COMMIT generated skills

  **What to do**:
  - Per Q3, do NOT add a standalone `generate-custom-skills` command. Instead create ONE umbrella `scripts/generate-skills.ts` (wired `pnpm generate-skills`) that runs, in order: (1) the existing tool-usage-reference generation (call the logic from `generate-tool-usage-skill.ts`), (2) the NEW per-service generation (Task 4 core over `[hostfully, sifely, github, slack, knowledge-base, platform]` from `ALL_TOOL_DESCRIPTORS`, writing `src/workers/skills/<skill-name>/SKILL.md` + `actions/<tool>.md`), and (3) the Composio generation (`generate-composio-skills.ts`) ONLY when `COMPOSIO_API_KEY` is present — degrade to a logged no-op when absent (so local runs without the key still succeed).
  - Refactor the existing per-script files into importable functions so the umbrella composes them (keep `generate-tool-usage-skill` and `generate-composio-skills` runnable standalone too — do NOT break their existing `pnpm` aliases or CI steps). Descriptor-driven parts (1)+(2) are deterministic (sorted, LF, write-if-changed; reuse existing helpers).
  - Run `pnpm generate-skills` once and COMMIT all generated skills (ships via `Dockerfile:79 COPY` — no Dockerfile change).

  **Must NOT do**:
  - Do NOT run on a timer. Do NOT create `_`-named folders. Do NOT remove or rename the existing `generate-tool-usage-skill` / `generate-composio-skills` aliases (their CI gates depend on them). Do NOT make the descriptor-driven parts depend on `COMPOSIO_API_KEY` (only the Composio step is key-gated). Do NOT touch `uuid-disambiguation`.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: NO (depends on 4, 2) · Wave 2 · Blocks: 7, 8, 9 · Blocked By: 4, 2

  **References**:
  - `scripts/generate-tool-usage-skill.ts` (part 1 — make `buildContent()`/`main()` importable), `scripts/generate-composio-skills.ts` (part 3 — already key-gated/no-op without key per the drift-audit), Task 4 core (part 2)
  - `package.json:36-38` — existing `generate-composio-skills` / `generate-tool-usage-skill` aliases to PRESERVE; add `generate-skills`
  - `Dockerfile:79` (`COPY src/workers/skills/`); `src/lib/tool-registry.ts`

  **Acceptance Criteria**:
  - [ ] `pnpm generate-skills` (no key) writes the tool-usage reference + the 6 per-service folders, and logs that Composio was skipped (no-op) — exits 0
  - [ ] `pnpm generate-skills` (with `COMPOSIO_API_KEY`) ALSO regenerates `composio-*` skills
  - [ ] Existing `pnpm generate-tool-usage-skill` and `pnpm generate-composio-skills` still work standalone (aliases + CI intact)
  - [ ] Idempotent for descriptor-driven parts (second run → empty git diff); `ls src/workers/skills/ | grep '_'` empty
  - [ ] Generated folders committed

  **QA Scenarios**:

  ```
  Scenario: One command generates reference + per-service (+ composio when keyed)
    Tool: Bash
    Steps:
      1. unset COMPOSIO_API_KEY; pnpm generate-skills ; assert exit 0 + log "Composio skipped"
      2. ls src/workers/skills/ | grep -E '^(hostfully|sifely|github|slack|knowledge-base|platform)$' | wc -l → 6
      3. Assert tool-usage-reference/SKILL.md also regenerated; each per-service has SKILL.md + actions/
    Expected Result: one-shot descriptor generation; Composio no-op without key
    Evidence: .sisyphus/evidence/custom-skills/task-5-umbrella.txt

  Scenario: Standalone aliases still work + idempotent
    Tool: Bash (git)
    Steps:
      1. pnpm generate-tool-usage-skill ; pnpm generate-composio-skills (or assert no-op) → still valid
      2. pnpm generate-skills twice ; git diff --exit-code src/workers/skills/{tool-usage-reference,hostfully,sifely,github,slack,knowledge-base,platform}
    Expected Result: aliases intact; empty diff on second run
    Evidence: .sisyphus/evidence/custom-skills/task-5-idempotent.txt
  ```

  **Commit**: YES — `feat(skills): umbrella generate-skills command (reference + per-service + composio)`

- [x] 6. `loadCustomIntegrations(tenantId)` — worker-side tenant detection

  **What to do**:
  - Add `loadCustomIntegrations(tenantId): Promise<string[]>` (worker lib, beside `loadConnectedToolkits`) returning the lowercase set of connected custom SERVICES via worker `query()` from `src/workers/lib/postgrest-client.ts`. Signals:
    - `hostfully` ← any `tenant_secrets.key` matching `hostfully_*`
    - `sifely` ← any `tenant_secrets.key` matching `sifely_*`
    - `slack` ← `tenant_secrets.key = 'slack_bot_token'` (Slack-via-Composio is DISABLED — do NOT consult composio_connections)
    - `github` ← `tenant_integrations` provider=`github` AND `deleted_at IS NULL` OR `tenant_secrets.key = 'github_installation_id'`
  - De-dup via `new Set()`; lowercase comparisons; filter soft-deletes; `[]` on failure (mirror `loadConnectedToolkits`). Query keys via `GET /tenant_secrets?...&select=key` (no ciphertext) + `GET /tenant_integrations?...&provider=eq.github&deleted_at=is.null&select=id`.

  **Must NOT do**:
  - Do NOT import `TenantSecretRepository` in worker code. Do NOT decrypt secrets (keys only). Do NOT add a Slack-via-Composio branch. Do NOT throw on failure.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`data-access-conventions`]

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 7, 8 · Blocked By: None

  **References**:
  - `src/workers/lib/agents-md-compiler.mts:42-53` — `loadConnectedToolkits()` (exact pattern to mirror)
  - `src/workers/lib/postgrest-client.ts` — worker `query()` client
  - `prisma/seed.ts:120-125` — Hostfully keys; `docs/guides/2026-06-12-2030-drift-audit.md:109-113` — verified secret-key inventory (HOSTFULLY\_\*, SLACK_BOT_TOKEN, sifely)
  - `src/gateway/services/tenant-integration-repository.ts` — `provider='github'` row shape

  **Acceptance Criteria**:
  - [ ] Integration test (`ai_employee_test`): tenant with only `sifely_*` → `['sifely']`
  - [ ] Mixed-case keys lowercased; soft-deleted github integration excluded
  - [ ] Failure → `[]`, no throw

  **QA Scenarios**:

  ```
  Scenario: Detects exactly the connected services
    Tool: Bash (vitest integration vs ai_employee_test)
    Steps:
      1. Seed a tenant with hostfully_api_key + slack_bot_token only
      2. loadCustomIntegrations(tenantId)
      3. Assert exactly {hostfully, slack}; NOT sifely/github
    Expected Result: precise detection
    Evidence: .sisyphus/evidence/custom-skills/task-6-detect.txt

  Scenario: GitHub via either store; soft-delete excluded
    Tool: Bash (vitest integration)
    Steps:
      1. Seed tenant_integrations provider=github deleted_at=null → github detected
      2. Soft-delete it, no github_installation_id → github NOT detected
    Expected Result: correct github detection
    Evidence: .sisyphus/evidence/custom-skills/task-6-github.txt
  ```

  **Commit**: YES — `feat(worker): detect connected custom integrations per tenant`

- [x] 7. `filterCustomSkills(connectedServices)` + wire into both phases + list-sync invariant

  **What to do**:
  - Add `filterCustomSkills(connectedServices: string[])` to `src/workers/lib/harness-helpers.mts` (sibling to `filterComposioSkills`). Over an EXPLICIT ALLOWLIST `['hostfully','sifely','github','slack']`, `rm -rf` any whose service is NOT in `connectedServices`. ALWAYS keep `knowledge-base`, `platform`. NEVER touch `composio-*`, `tool-usage-reference`, `uuid-disambiguation`, or anything outside the allowlist. Case-insensitive; never throws; no-op gracefully if an allowlisted folder is absent.
  - Call `filterCustomSkills(await loadCustomIntegrations(tenantId))` in BOTH `execution-phase.mts` and `delivery-phase.mts` immediately AFTER `filterComposioSkills(...)`, before `compileAgentsMd`/server start. Log kept vs removed.
  - Add a list-sync invariant unit test: every service in `ALL_TOOL_DESCRIPTORS` is accounted for in `(allowlist ∪ always-keep)` — fails on a new unaccounted service.

  **Must NOT do**:
  - Do NOT use a `startsWith` prefix match. Do NOT edit `filterComposioSkills`. Do NOT delete outside the allowlist. Do NOT run after the OpenCode server starts.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: NO (full test needs 6 skills) · Wave 2 · Blocks: 10 · Blocked By: 5 (skills exist), 6 (detection)

  **References**:
  - `src/workers/lib/harness-helpers.mts:301-341` — `filterComposioSkills` (structure to mirror; but allowlist, not prefix)
  - `src/workers/lib/execution-phase.mts:183-201` — insertion point after `filterComposioSkills` (~187), before `compileAgentsMd` (~192)
  - `src/workers/lib/delivery-phase.mts:100-118` — same sequence (~104)
  - Task 6 `loadCustomIntegrations`; `src/lib/tool-registry.ts` (invariant test source)

  **Acceptance Criteria**:
  - [ ] `filterCustomSkills(['hostfully'])` keeps `hostfully/`, `knowledge-base/`, `platform/`; removes `sifely/`/`github/`/`slack/`; never touches `composio-*`/`tool-usage-reference`/`uuid-disambiguation`
  - [ ] `filterCustomSkills([])` keeps the always-keep set
  - [ ] List-sync test fails if a discovered service is unaccounted for
  - [ ] Called in BOTH phases after `filterComposioSkills`, before server start

  **QA Scenarios**:

  ```
  Scenario: Allowlist filter keeps/removes correctly
    Tool: Bash (vitest on a temp skills dir)
    Steps:
      1. Seed temp dir with hostfully/sifely/github/slack/knowledge-base/platform/tool-usage-reference/uuid-disambiguation/composio-notion
      2. filterCustomSkills(['hostfully'])
      3. Assert only sifely/github/slack removed; everything else intact
    Expected Result: precise allowlist filtering
    Evidence: .sisyphus/evidence/custom-skills/task-7-filter.txt

  Scenario: Zero-secret tenant keeps always-keep set
    Tool: Bash (vitest)
    Steps:
      1. filterCustomSkills([])
      2. Assert knowledge-base + platform remain; hostfully/sifely/github/slack removed; tool-usage-reference + uuid-disambiguation intact
    Expected Result: submit-output + KB reachable
    Evidence: .sisyphus/evidence/custom-skills/task-7-zero.txt

  Scenario: List-sync invariant catches an unaccounted service
    Tool: Bash (vitest)
    Steps:
      1. Add a fake 'stripe' descriptor to the test fixture
      2. Assert the invariant test FAILS
    Expected Result: invariant guards drift
    Evidence: .sisyphus/evidence/custom-skills/task-7-invariant.txt
  ```

  **Commit**: YES — `feat(worker): filter custom-integration skills to connected services at boot`

- [x] 8. `## Custom Integrations` section in compiled AGENTS.md

  **What to do**:
  - In `src/workers/lib/agents-md-compiler.mts`, add `buildCustomIntegrationsSection(connectedServices)` analogous to the existing Composio `buildConnectedAppsSection()`, and inject it into `compileAgentsMd()` for BOTH phases. It lists the tenant's connected custom integrations (human-readable names) and points the employee at the per-service skill for exact usage — concise, no full catalog inlined.
  - Wire `compileAgentsMd()` to receive `connectedServices` (from `loadCustomIntegrations`) the way it already receives `connectedToolkits`; pass from both `execution-phase.mts` and `delivery-phase.mts`. Employee-agnostic language only.

  **Must NOT do**:
  - Do NOT inline full action catalogs. Do NOT duplicate `buildConnectedAppsSection`. Do NOT use employee-specific wording.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: NO (depends on 6) · Wave 3 · Blocks: 10 · Blocked By: 6

  **References**:
  - `src/workers/lib/agents-md-compiler.mts` — `buildConnectedAppsSection()` + `compileAgentsMd()` section order (mirror placement)
  - `src/workers/lib/execution-phase.mts:189-201` + `delivery-phase.mts:106-125` — `compileAgentsMd()` call sites (add the new arg)
  - Task 6 `loadCustomIntegrations`
  - Golden fixtures: `compileAgentsMd()` has a golden test — update the baseline intentionally

  **Acceptance Criteria**:
  - [ ] Compiled AGENTS.md contains `## Custom Integrations` listing connected services for a tenant that has them
  - [ ] Section absent/empty for a zero-secret tenant
  - [ ] Present in BOTH execution and delivery output; `golden-prompts` baseline updated + green

  **QA Scenarios**:

  ```
  Scenario: Section reflects connected services
    Tool: Bash (vitest)
    Steps:
      1. compileAgentsMd with connectedServices=['hostfully','sifely'] → assert section lists both
      2. compileAgentsMd with [] → section omitted/empty
      3. pnpm test:unit -- golden-prompts → green (baseline updated)
    Expected Result: accurate conditional section; golden green
    Evidence: .sisyphus/evidence/custom-skills/task-8-section.txt
  ```

  **Commit**: YES — `feat(worker): add Custom Integrations section to compiled AGENTS.md`

- [x] 9. CI freshness check for custom skills

  **What to do**:
  - Add a step to the `test` job in `.github/workflows/deploy.yml` (mirroring the `Check tool-usage-skill freshness` step at `:59-65`) that runs `pnpm generate-skills` then `git diff --exit-code src/workers/skills/{hostfully,sifely,github,slack,knowledge-base,platform}` and fails with a descriptive `::error::` on drift. Deterministic for the descriptor-driven parts (source is the local `ALL_TOOL_DESCRIPTORS` — no external API/secret needed; Composio step no-ops without its key, so its folders are NOT in this diff scope). NOTE: the existing `Check tool-usage-skill freshness` and Composio CI gates stay as-is — this new step only covers the 6 per-service folders.

  **Must NOT do**:
  - Do NOT auto-commit. Do NOT add a scheduled workflow. Do NOT include `tool-usage-reference`/`uuid-disambiguation`/`composio-*` in the diff scope.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: NO (depends on 5) · Wave 3 · Blocks: Final · Blocked By: 5

  **References**:
  - `.github/workflows/deploy.yml:59-65` — the `tool-usage-skill` freshness step to mirror (no secret needed, unlike Composio's)
  - Task 5 generator script

  **Acceptance Criteria**:
  - [ ] CI step fails when a committed custom skill is hand-edited to diverge
  - [ ] CI step passes when fresh; no mutation; no API key required

  **QA Scenarios**:

  ```
  Scenario: Stale custom skills fail CI (local simulation)
    Tool: Bash
    Steps:
      1. Hand-edit a committed actions/*.md under a generated service
      2. pnpm generate-skills && git diff --exit-code src/workers/skills/<service>
      3. Assert non-zero exit
    Expected Result: drift detected
    Evidence: .sisyphus/evidence/custom-skills/task-9-stale.txt
  ```

  **Commit**: YES — `ci: fail build when committed custom skills are stale`

- [x] 10. **LIVE END-TO-END VERIFICATION — rebuilt container + live employee tasks**

  > Capstone. Does NOT accept "code looks right". Requires a REBUILT Docker image, real container skill inspection, and live employee tasks. Run AFTER Tasks 1–9 and the rebuild.

  **Preconditions (verify ALL)**:
  - Services healthy: `curl localhost:7700/health`, `curl localhost:8288/health`, Socket Mode connected.
  - **Docker image rebuilt**: `docker build -t ai-employee-worker:latest .` (in tmux per long-running-commands skill) — MANDATORY; generated skills + `filterCustomSkills` only ship via rebuild.

  **What to do**:
  1. **Image proof**: `docker run --rm ai-employee-worker:latest ls /app/.opencode/skills/` → assert the 6 custom service skills + `tool-usage-reference` + `uuid-disambiguation` + `composio-*` are baked in.
  2. **Connected-tenant filter proof**: trigger a real **guest-messaging** task for VLRE (Hostfully + Sifely secrets). While Executing, `docker exec <container> ls /app/.opencode/skills/` → assert `hostfully/`+`sifely/` present, `github/`/`slack/` filtered per secrets, `knowledge-base/`+`platform/` present, `composio-*` correctly filtered, `tool-usage-reference` STILL present (not deleted). Confirm the task uses correct Sifely paths (`/tools/sifely/*.ts`) and reaches a terminal state; capture `task_status_log`.
  3. **Zero-secret tenant proof**: trigger a task for a tenant with NO custom secrets. Assert only `knowledge-base/`+`platform/` custom skills survive (+ tool-usage-reference/uuid-disambiguation/composio if any), and the task reaches `Done` (both `/tmp` contract files written).
  4. **Endpoints**: `curl GET /admin/tools` → 200, `tools.length>=30` (descriptions from descriptors); brain-preview → 200.
  5. Soft-delete any throwaway employee.

  **Must NOT do**:
  - Do NOT accept "verified from code". Do NOT skip the rebuild. Do NOT leave throwaways active.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`, `feature-verification`, `debugging-lifecycle`]

  **Parallelization**: Can Run In Parallel: NO (after ALL impl) · Wave 4 · Blocks: 11, Final · Blocked By: 1-9

  **References**:
  - `e2e-testing`, `feature-verification`, `debugging-lifecycle` skills
  - `src/workers/lib/harness-helpers.mts` — `Skills available in container` log line
  - AGENTS.md § guest-messaging (Hostfully/Sifely test resources); `real-estate-motivation-bot-2` smoke

  **Acceptance Criteria** (all agent-executable):
  - [ ] Rebuilt image lists the 6 custom skills + tool-usage-reference + uuid-disambiguation + composio-\*
  - [ ] Connected-tenant container: `hostfully/`+`sifely/` present, non-connected services filtered, always-keep present, `tool-usage-reference` STILL present, `composio-*` correctly filtered
  - [ ] Guest-messaging task reaches a terminal state via correct Sifely paths; `task_status_log` captured
  - [ ] Zero-secret tenant: only always-keep custom skills survive; task reaches `Done`
  - [ ] `/admin/tools` 200 (`>=30`) + brain-preview 200
  - [ ] Throwaways soft-deleted

  **QA Scenarios**:

  ```
  Scenario: Full live chain — rebuild → container filter → live task → endpoints
    Tool: interactive_bash (tmux build) + Bash (docker/curl/psql) + e2e triggers
    Preconditions: Tasks 1-9 done; services healthy
    Steps:
      1. docker build in tmux; wait EXIT_CODE:0
      2. docker run --rm ... ls /app/.opencode/skills/ ; assert 6 custom + tool-usage-reference + uuid-disambiguation + composio-*
      3. Trigger guest-messaging (VLRE); docker exec <container> ls skills ; assert hostfully+sifely present, tool-usage-reference present, non-connected filtered
      4. psql task_status_log; assert terminal; grep task log for /tools/sifely/
      5. Trigger zero-secret tenant; assert only knowledge-base+platform custom skills; task Done
      6. curl /admin/tools (200,>=30) + brain-preview (200)
      7. Soft-delete throwaways
    Expected Result: every checkpoint passes with saved evidence
    Failure Indicators: tool-usage-reference MISSING (wrongly deleted); github/slack present without secret (filter wrong); zero-secret task fails (always-keep broken); endpoint 500 (decouple incomplete)
    Evidence: .sisyphus/evidence/custom-skills/task-10-live/ (image-skills.txt, container-skills.txt, status-log.txt, sifely-path-grep.txt, zero-secret-skills.txt, zero-secret-status.txt, admin-tools.json, brain-preview.json)
  ```

  **Commit**: NO (verification only — evidence committed under .sisyphus/)

- [x] 11. Docs — AGENTS.md + README

  **What to do**:
  - Update AGENTS.md: add the umbrella `pnpm generate-skills` command to the Commands table (and note it composes `generate-tool-usage-skill` + per-service + `generate-composio-skills`); document the custom per-service skill system (generated FROM `ALL_TOOL_DESCRIPTORS`, registry-derived invocation paths, `filterCustomSkills` allowlist + always-keep, `loadCustomIntegrations` detection signals, `## Custom Integrations` AGENTS.md section); note that `tool-usage-reference` remains the always-on generated reference (NOT replaced). Per the Documentation Durability rule (no volatile counts/line numbers).
  - Update README Scripts table with `generate-skills`. Update `.env.example` only if a new var was introduced (none expected).

  **Must NOT do**:
  - Do NOT add volatile counts/line-numbers. Do NOT claim `tool-usage-reference` was deleted.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: Can Run In Parallel: NO (depends on 10) · Wave 5 · Blocks: 12 · Blocked By: 10

  **References**:
  - `AGENTS.md` § Commands, § Skills System (Employee skills table), § Composio skill system (mirror wording)
  - `README.md` § Scripts
  - All implemented tasks

  **Acceptance Criteria**:
  - [ ] AGENTS.md documents the custom per-service skill system + new command; correctly states `tool-usage-reference` is retained/generated
  - [ ] README Scripts table updated

  **QA Scenarios**:

  ```
  Scenario: Docs reflect reality
    Tool: Bash (grep)
    Steps:
      1. grep "generate-skills" AGENTS.md README.md → present
      2. grep "filterCustomSkills" AGENTS.md → present
      3. Assert no claim that tool-usage-reference was deleted
    Expected Result: docs current
    Evidence: .sisyphus/evidence/custom-skills/task-11-docs.txt
  ```

  **Commit**: YES — `docs: document custom-integration per-service skill system`

- [x] 12. Notify completion

  **What to do**:
  - Send Telegram: `tsx scripts/telegram-notify.ts "✅ Custom Integration Skills (tenant-filtering layer) complete — all tasks done, live-verified in a rebuilt container. Come back to review."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: NO · Wave 5 · Blocks: Final · Blocked By: 11

  **References**:
  - `scripts/telegram-notify.ts`

  **Acceptance Criteria**:
  - [ ] Telegram notification sent

  **QA Scenarios**:

  ```
  Scenario: Notification sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "..." ; assert exit 0
    Expected Result: delivered
    Evidence: .sisyphus/evidence/custom-skills/task-12-notify.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> Runs AFTER Task 10's live E2E has passed. 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Never mark F1–F4 checked before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command, container ls). For each "Must NOT Have": search for forbidden patterns (deletion of `tool-usage-reference`; a second tool-doc source; edits to `filterComposioSkills`/composio generator/`composio-*`/`generate-tool-usage-skill`; prefix-match in `filterCustomSkills`; `tool_registry` enforcement change; Slack-via-Composio detection; cron/timer) — reject with file:line if found. Confirm evidence files in `.sisyphus/evidence/custom-skills/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit` (incl. `golden-prompts`). Review changed files for `as any`/`@ts-ignore`, empty catches, AI slop. Verify the per-service generator reads `ALL_TOOL_DESCRIPTORS` (no re-implemented scanning, no second source), `filterCustomSkills` mirrors `filterComposioSkills`, worker code uses `process.env` per worker convention.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Live E2E Evidence Audit** — `unspecified-high` (+ `feature-verification`)
      AUDIT Task 10 evidence in `.sisyphus/evidence/custom-skills/task-10-live/` for sufficiency: rebuilt-image proof, container `ls` showing correct kept/removed custom skills, zero-secret-tenant `Done` proof, both endpoints HTTP 200 with descriptor-sourced enrichment. Re-verify live if a container is available; REJECT and require re-run if evidence is missing/stale.
      Output: `Evidence complete [Y/N] | Container filter [Y/N] | Zero-secret Done [Y/N] | Endpoints 200 [Y/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1. Confirm no monolith deletion, no second tool-doc source, no edits to the Composio system or the existing `generate-tool-usage-skill` generator, `/tools/knowledge_base/` not renamed, `tool_registry` enforcement untouched. Flag contamination + unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [x] F5. **Documentation Freshness** — update AGENTS.md (umbrella `generate-skills` command, custom per-service skill system, registry-derived invocation paths, `filterCustomSkills`, `loadCustomIntegrations`, `## Custom Integrations` AGENTS.md section) and README/.env.example as needed. Per AGENTS.md Documentation Freshness rule.

- [x] F6. **Tmux cleanup** — kill all `ai-*` tmux sessions created during execution.

- [ ] F7. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

## Commit Strategy

One commit per task (or per tightly-coupled pair). Conventional commits. Never `--no-verify`. No AI/Co-authored-by references.

## Success Criteria

### Verification Commands

```bash
pnpm build                                                                  # clean
pnpm lint                                                                   # clean
pnpm test:unit                                                              # 0 failures (incl. golden-prompts)
pnpm generate-skills && git diff --exit-code src/workers/skills/{hostfully,sifely,github,slack,knowledge-base,platform}  # idempotent (descriptor-driven parts)
pnpm generate-tool-usage-skill && git diff --exit-code src/workers/skills/tool-usage-reference/SKILL.md  # still green after Sifely fix
ls src/workers/skills/ | grep '_'                                           # empty (no snake_case skill folders)
docker run --rm ai-employee-worker:latest ls /app/.opencode/skills/         # 6 custom + composio + tool-usage-reference + uuid-disambiguation
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (esp. no monolith deletion, no second source)
- [ ] All tests pass (incl. golden-prompts)
- [ ] Live task in a REBUILT container shows correctly-filtered custom skills; zero-secret tenant reaches Done
