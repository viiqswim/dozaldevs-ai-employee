# AGENTS.md Leanness Pass — Round 2 (Router, Not Manual)

> **Second pass.** Round 1 (`2026-06-15-2351-agents-md-cleanup`) fixed facts and removed dead content (771→700 lines). This round is an aggressive **information-architecture refactor**: migrate domain detail INTO existing skills, keep AGENTS.md as a fast **router** of critical never-violate rules + invariants + pointers. The behavior being preserved is **agent decision-making quality**, not code execution.

## TL;DR

> **Quick Summary**: Aggressively slim the repo-root `AGENTS.md` (700 lines, injected into EVERY dev-side LLM call) by moving deep how-to, sub-reference tables, and domain-specific conventions into the existing `.opencode/skills/*` and `docs/*` that already own those topics — leaving behind a lean router of universal rules, invariants, one tripwire pointer per migrated always-violated rule, and a single skill-dispatch table.
>
> **Deliverables**:
>
> - A materially smaller, router-style `AGENTS.md` (universal never-violate rules + invariants + dispatch table + tripwire pointers)
> - Migrated content landed and verified in 7 destination skill files (3 ABSENT + 4 PARTIAL) before any AGENTS.md deletion
> - A reconciliation artifact mapping every removed block → `{kept-inline | moved-to:<dest> | dropped-as-dead}`
> - A one-line "load the matching skill before editing" meta-instruction near the top
> - Trimmed + pruned Reference Documents table
> - Zero loss of any MANDATORY/CRITICAL/NEVER/FORBIDDEN rule, semantic constant, or protected verbatim string
>
> **Estimated Effort**: Medium–Large
> **Parallel Execution**: PARTIAL — destination-skill edits (different files) parallelize; all AGENTS.md edits serialize (single file). Add-to-skill ALWAYS precedes the paired AGENTS.md deletion.
> **Critical Path**: Baseline + inventories → add/complete content in skills (verify present) → serialized AGENTS.md trims/deletes → reconciliation gate → F1-F3 reviews → user okay → notify

---

## Context

### Original Request

"Interview me about the contents of AGENTS.md so we end up with the leanest and most useful AGENTS.md possible."

### Why It Matters

`AGENTS.md` is injected into **every** dev-side LLM call. Every token costs on every turn. The prior round made it accurate; this round makes it lean — converting a reference manual into a router that points the agent to the right skill/file fast.

### Interview Summary — Confirmed Decisions

- **Aggressiveness**: AGGRESSIVE — "router, not manual." Strip to critical never-violate rules + invariants + pointers.
- **"Useful"**: FAST ROUTER — the agent immediately knows which skill to load / file to open.
- **Audience**: DEV coding agent ONLY. The worker container compiles its **own** AGENTS.md from `src/workers/config/agents.md` — that file and `src/workers/skills/` are HARD OUT.
- **Skills tables**: keep ONE skill-dispatch table; delete the two description tables + the separate "Detailed Topics → Skills" table (descriptions live in each `SKILL.md` frontmatter).
- **Leanness target**: NO hard line gate — "materially smaller" + report before/after delta + reviewer judgment.
- **Reference Documents table**: BOTH — prune stale/superseded rows AND trim surviving "When to Read" cells.
- **Telegram rules**: KEEP AS-IS (explicit user override — verbatim-protected).
- **Migration destinations are EXISTING skills/docs only** — no new skill invented.

### Metis Review — Critical Findings (encoded as guardrails below)

- **R1 (HIGHEST) — Conditional-load regression**: Skills load by description-match; the skill **body** is NOT in context until triggered. Rules the destination skill marks as "models violate by default" (e.g. react-dashboard: SearchableSelect, card-shells, URL-state) become silently breakable if buried. **Mitigation: TRIPWIRE PATTERN** — keep a one-line imperative inline pointer that NAMES the rule and commands loading the skill BEFORE acting.
- **R2 — Dangling pointer**: `creating-archetypes/SKILL.md` already points back at "AGENTS.md § Approved LLM Models" for the catalog list. Deleting that section without inlining the list into the skill first = circular-reference loss. Fix the skill's back-pointer in the SAME task that inlines the list.
- **R3 — Silent loss on 3 ABSENT mappings**: OpenCodeGo routing mechanics, seeded-catalog list + per-model reliability quirks, archetype-edit-helpers/enforce_tool_registry/never-block — content exists ONLY in AGENTS.md. Hard ordering: add-to-skill + verify BEFORE delete.
- Destination audit: **3 ABSENT, 4 PARTIAL, 5 PRESENT** across the 12 migration mappings (table in Task 2).
- **Structure**: paired add-then-delete tasks gated by a reconciliation artifact — NOT a single rewrite.

---

## Work Objectives

### Core Objective

Convert `AGENTS.md` from a manual into a router: keep every UNIVERSAL never-violate rule + invariant + a one-line tripwire/dispatch pointer to where domain detail now lives; migrate all DOMAIN-SPECIFIC detail into the existing skill/doc that owns it — with zero silent loss.

### Concrete Deliverables

- Router-style `AGENTS.md`, materially smaller, with: meta-instruction, one skill-dispatch table, universal rules inline, one tripwire pointer per migrated always-violated rule, trimmed Reference Documents table.
- Migrated content present + verified in 7 destination skill files.
- Reconciliation artifact at `.sisyphus/evidence/round2-reconciliation.md`.
- Critical-rule + semantic-constant + verbatim-string inventories captured as the regression baseline.

### Definition of Done

- [ ] Every migration mapping verified present in its destination via grep BEFORE the paired AGENTS.md deletion
- [ ] Reconciliation artifact shows zero `dropped-as-dead` that wasn't explicitly approved
- [ ] All universal MANDATORY/CRITICAL/NEVER/FORBIDDEN rules still inline in AGENTS.md
- [ ] Every always-violated domain rule that moved has a one-line tripwire inline
- [ ] All semantic constants present verbatim (grep -F per constant)
- [ ] All 10 self-demonstrating verbatim strings intact (grep -F per string)
- [ ] Telegram Notifications section byte-identical to baseline
- [ ] `git diff --name-only` contains ZERO `src/workers/` paths
- [ ] No dangling `see AGENTS.md §`/`listed in AGENTS.md` pointers to deleted sections remain in skills
- [ ] AGENTS.md materially smaller than 700 lines (report delta)
- [ ] Markdown tables render (no broken rows)

### Must Have

- The TRIPWIRE PATTERN applied to every always-violated-by-default domain rule that moves.
- Add-to-skill BEFORE delete-from-AGENTS.md ordering, per mapping.
- A meta-instruction near the top: "Before editing ANY file, check the dispatch table and load the matching skill — mandatory, not advisory."
- Reconciliation artifact gating completion.

### Must NOT Have (Guardrails)

- NO edits to `src/workers/config/agents.md` (worker base config) or anything under `src/workers/skills/` — HARD OUT.
- NO edits to `~/.config/opencode/AGENTS.md`.
- NO deletion of any UNIVERSAL rule (multi-tenancy, soft-delete, discover-before-build, employee-agnostic shared files, /tmp-tools-only, exactly-two-things, World-A/World-B) — these stay inline.
- NO alteration/"freshening" of any semantic constant or the 10 protected verbatim strings.
- NO trimming of the Telegram Notifications section.
- NO new skill created — migrate into EXISTING skills/docs only.
- NO deletion of any block before its content is verified present in the destination.
- NO new volatile counts introduced (per § Documentation Durability).
- NO edits to source/DB/seed (`.ts`/`.json`/`.prisma`) — markdown-only.
- NO "fixing" the self-demonstrating examples in § Documentation Durability.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed via `grep`/`grep -F`/`diff`/`wc`/`git`/markdown-render. This is a documentation refactor; Playwright/curl/tmux do not apply. Every criterion is a command with binary pass/fail.

### Test Decision

- **Infrastructure exists**: N/A (documentation task)
- **Automated tests**: NONE
- **Primary verification**: per-mapping grep assertions in destinations + verbatim-string/constant grep gates + scope `git diff` gate + reconciliation diff against the baseline inventories.

### QA Policy

Every task includes agent-executed QA scenarios using **Bash (grep/grep -F/diff/wc/git)**. Evidence saved to `.sisyphus/evidence/round2-task-{N}-{scenario-slug}.txt`.

---

## Execution Strategy

### Waves

```
Wave 1 (Baseline + inventories — blocks all edits):
└── Task 1: Commit baseline + extract critical-rule / semantic-constant / verbatim-string inventories + seed reconciliation artifact

Wave 2 (Destination-skill content — parallel, different files; MUST complete+verify before paired deletes):
├── Task 2: ABSENT #1 — inline catalog list + reliability quirks into creating-archetypes/e2e-testing; FIX dangling back-pointer (R2)
├── Task 3: ABSENT #2 — OpenCodeGo routing mechanics → creating-archetypes
├── Task 4: ABSENT #3 — archetype-edit-helpers/enforce_tool_registry/never-block → creating-archetypes
├── Task 5: PARTIAL — Slack routing symbols → execution-trace-debugging; unescape-args → adding-shell-tools
├── Task 6: PARTIAL — role_name/intent-steps/converse-create internals → creating-archetypes/employee-creation-debugging
├── Task 7: PARTIAL — ToolDescriptor/ALL_TOOL_DESCRIPTORS → adding-shell-tools/data-access-conventions
├── Task 8: PARTIAL — E2E pre-flight scripts + scenario tables → e2e-testing/feature-verification
└── Task 9: Auth deep content (JWT profiles, key model, RBAC tables, bootstrap, middleware order) → security skill / user-auth-rbac doc

Wave 3 (AGENTS.md edits — SERIALIZED, one editor at a time, each gated on its Wave-2 source):
├── Task 10: Restructure skills section → ONE dispatch table + meta-instruction; delete description tables + Detailed-Topics table
├── Task 11: Trim Approved LLM Models (keep constraint loud; delete migrated catalog/quirks/Go-routing)
├── Task 12: Trim OpenCode Worker (keep map/lifecycle/inngest/contract/pin; delete migrated routing/unescape/multi-provider)
├── Task 13: Trim Adding-Employee / Tenants / Dashboard URLs to skeletons + tripwires
├── Task 14: Collapse Auth section to ~5-line core + pointer
├── Task 15: Trim Database to connection+invariants+settings-keys; point columns to schema.prisma
├── Task 16: Split Key Conventions — universal inline; domain rules → tripwire pointers
├── Task 17: Trim Project Structure tree to one-line-per-dir + load-bearing files
├── Task 18: Collapse both E2E sections to the loud mandate + skill pointers
├── Task 19: Drop Future Work backlog; prune+trim Reference Documents table; verify Telegram untouched
└── Task 20: Add tripwire pointers audit pass (ensure every migrated always-violated rule has one)

Wave 4 (Verification):
└── Task 21: Reconciliation completion + all grep/scope/render gates + before/after delta

Wave FINAL (Reviews + notify):
├── F1: Information-preservation audit (oracle)
├── F2: Doc accuracy + markdown quality (unspecified-high)
└── F3: Scope fidelity check (deep)
-> Present results -> user okay
└── Task 22: Notify completion (Telegram)

Critical Path: Task 1 → Tasks 2-9 (skills landed+verified) → Tasks 10-20 (serialized AGENTS.md) → Task 21 → F1-F3 → user okay → Task 22
```

### Dependency Matrix

| Task | Depends On        | Blocks                     |
| ---- | ----------------- | -------------------------- |
| 1    | —                 | 2-21                       |
| 2-9  | 1                 | their paired Wave-3 delete |
| 10   | 1                 | 11-20 (serialized)         |
| 11   | 2, 3, 10          | 12                         |
| 12   | 3, 5, 11          | 13                         |
| 13   | 2, 6, 12          | 14                         |
| 14   | 9, 13             | 15                         |
| 15   | 14                | 16                         |
| 16   | 4, 5, 7, 8, 15    | 17                         |
| 17   | 16                | 18                         |
| 18   | 8, 17             | 19                         |
| 19   | 18                | 20                         |
| 20   | 19                | 21                         |
| 21   | 2-20              | F1-F3                      |
| 22   | F1-F3 + user okay | —                          |

### Agent Dispatch Summary

| Task | Category         | Skills        |
| ---- | ---------------- | ------------- |
| 1    | quick            | —             |
| 2    | writing          | skill-creator |
| 3    | writing          | skill-creator |
| 4    | writing          | skill-creator |
| 5    | writing          | skill-creator |
| 6    | writing          | skill-creator |
| 7    | writing          | skill-creator |
| 8    | writing          | skill-creator |
| 9    | writing          | skill-creator |
| 10   | writing          | —             |
| 11   | unspecified-high | —             |
| 12   | unspecified-high | —             |
| 13   | writing          | —             |
| 14   | unspecified-high | —             |
| 15   | unspecified-high | —             |
| 16   | unspecified-high | —             |
| 17   | writing          | —             |
| 18   | writing          | —             |
| 19   | writing          | —             |
| 20   | unspecified-high | —             |
| 21   | quick            | —             |
| F1   | oracle           | —             |
| F2   | unspecified-high | —             |
| F3   | deep             | —             |
| 22   | quick            | —             |

---

## TODOs

> Add-to-skill (Wave 2) ALWAYS precedes the paired AGENTS.md deletion (Wave 3). EVERY task has Recommended Agent Profile + Parallelization + QA Scenarios. A task without QA Scenarios is INCOMPLETE.

- [x] 1. Baseline snapshot + preservation inventories + seed reconciliation artifact

  **What to do**:
  - Ensure `AGENTS.md` is committed at its current pre-edit state so `git show HEAD:AGENTS.md` is a clean diff baseline. Record the baseline SHA in evidence.
  - Capture baseline size: `wc -l AGENTS.md && wc -w AGENTS.md > .sisyphus/evidence/round2-task-1-baseline-size.txt`.
  - **Critical-rule inventory**: `grep -nE 'MANDATORY|CRITICAL|NEVER|MUST NOT|MUST |FORBIDDEN|do NOT|⚠️' AGENTS.md > .sisyphus/evidence/round2-critical-rule-inventory.txt`.
  - **Universal-vs-domain classification**: in the same inventory file, annotate each rule as `UNIVERSAL` (applies to every task — STAYS inline) or `DOMAIN` (migratable behind a tripwire). Universal set at minimum: multi-tenancy, soft-delete, discover-before-build, employee-agnostic-shared-files, /tmp-tools-only, exactly-two-things, World-A/World-B.
  - **Semantic-constant inventory**: capture every constant to preserve verbatim → `.sisyphus/evidence/round2-constants.txt`: `SYNTHESIS_THRESHOLD = 5`, `MAX_EMPLOYEE_RULES_CHARS = 8000`, `MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32000`, ports `5432`/`6543`, 30-min watchdog, OpenCode `1.14.31`.
  - **Verbatim-string inventory**: capture the 10 protected self-demonstrating strings from § Documentation Durability → `.sisyphus/evidence/round2-verbatim.txt` (e.g. `Active Functions (7)`, `the 14-model Go list`, `84 lines`, `58 stories`, `1490 passing, 27 skipped`, plus the others in that section's Forbidden list).
  - **Seed the reconciliation artifact** `.sisyphus/evidence/round2-reconciliation.md` with the 12-mapping table (ABSENT/PARTIAL/PRESENT statuses from Metis) — columns: `removed-block | destination | pre-status | verified-present? | verdict`.

  **Must NOT do**: Do NOT edit AGENTS.md content here — baseline + inventories only.

  **Recommended Agent Profile**:
  - **Category**: `quick` — mechanical git + grep capture.
  - **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (must be first). Blocks: 2-21. Blocked By: None.

  **References**:
  - `AGENTS.md` (repo root, absolute `/Users/victordozal/repos/dozal-devs/ai-employee/AGENTS.md`) — target.
  - `AGENTS.md` § "Documentation Durability" — source of the 10 protected verbatim strings + semantic-constant keep-list.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Baseline committed and all four inventories captured
    Tool: Bash (git + grep + test)
    Steps:
      1. Run: git show HEAD:AGENTS.md | head -1   → returns header (clean baseline exists)
      2. Run: for f in round2-critical-rule-inventory round2-constants round2-verbatim; do test -s .sisyphus/evidence/$f.txt && echo "$f OK"; done
      3. Run: test -s .sisyphus/evidence/round2-reconciliation.md && grep -c '|' .sisyphus/evidence/round2-reconciliation.md  → non-zero (12-row table seeded)
    Expected Result: baseline retrievable; all inventories non-empty; reconciliation seeded with 12 mappings
    Evidence: .sisyphus/evidence/round2-task-1-baseline-size.txt
  ```

  **Commit**: YES — `docs(agents): snapshot before leanness round 2` (only if uncommitted changes exist). Files: `AGENTS.md`.

- [x] 2. ABSENT #1 — inline seeded-catalog list + per-model reliability quirks into skills; FIX dangling back-pointer (R2)

  **What to do**:
  - Move the **seeded catalog model list** and the **per-model E2E bash-reliability quirks** (which models reliably call bash tools, the deepseek-v4-flash recommendation, the mimo-v2.5-pro vs mimo-v2.5 distinction) FROM AGENTS.md § Approved LLM Models INTO `.opencode/skills/creating-archetypes/SKILL.md` (catalog + model selection) and `.opencode/skills/e2e-testing/SKILL.md` (reliability-for-testing notes).
  - **FIX R2**: `creating-archetypes/SKILL.md` currently defers the catalog list back to "AGENTS.md § Approved LLM Models". Replace that back-pointer with the now-inlined list so there is NO circular reference after AGENTS.md is trimmed.
  - Do NOT yet delete from AGENTS.md (that is Task 11) — only ADD + verify present here.

  **Must NOT do**: Do NOT edit `src/workers/skills/` or `src/workers/config/agents.md`. Do NOT delete from AGENTS.md in this task. Do NOT introduce volatile counts (the list IS the source of truth).

  **Recommended Agent Profile**:
  - **Category**: `writing` — documentation authoring into skills.
  - **Skills**: `skill-creator` — correct SKILL.md frontmatter/structure.

  **Parallelization**: Can Run In Parallel: YES (different files from Tasks 3-9). Blocks: 11. Blocked By: 1.

  **References**:
  - `AGENTS.md` § "Approved LLM Models" — source content (seeded catalog list, reliability quirks).
  - `.opencode/skills/creating-archetypes/SKILL.md` — destination + the dangling back-pointer to fix.
  - `.opencode/skills/e2e-testing/SKILL.md` — destination for reliability-for-testing notes.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Catalog list + quirks present in destinations, back-pointer fixed
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'deepseek/deepseek-v4-flash' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
      2. grep -Fq 'minimax/minimax-m2.7' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
      3. grep -Eq 'bash tool|reliably call' .opencode/skills/e2e-testing/SKILL.md && echo PASS
      4. grep -c 'listed in AGENTS.md' .opencode/skills/creating-archetypes/SKILL.md  → 0 (back-pointer removed)
    Expected Result: catalog + quirks landed; circular back-pointer gone
    Evidence: .sisyphus/evidence/round2-task-2-catalog.txt
  ```

  **Commit**: YES — `docs(skills): inline model catalog + reliability notes; fix back-pointer`. Files: `creating-archetypes/SKILL.md`, `e2e-testing/SKILL.md`.

- [x] 3. ABSENT #2 — migrate OpenCodeGo routing mechanics → creating-archetypes

  **What to do**:
  - Move the **OpenCodeGo multi-provider routing mechanics** (when `OPENCODE_GO_API_KEY` is set, Go vs OpenRouter selection, `writeOpencodeAuth()` dual-entry, the two Go endpoint formats, usage limits, the `src/lib/go-models.ts` pointer) FROM AGENTS.md INTO `.opencode/skills/creating-archetypes/SKILL.md`.
  - Keep in AGENTS.md (for Task 11/12) only a one-line pointer: "OpenCodeGo routing → see `creating-archetypes` skill; model list in `src/lib/go-models.ts`."
  - ADD + verify only; deletion happens in the paired Wave-3 task.

  **Must NOT do**: No `src/workers/` edits. No AGENTS.md deletion here. No volatile counts (don't write "14-model list" outside the protected example).

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: `skill-creator`.

  **Parallelization**: Can Run In Parallel: YES. Blocks: 11, 12. Blocked By: 1.

  **References**:
  - `AGENTS.md` § "Approved LLM Models" (OpenCodeGo routing) + § "OpenCode Worker" (Multi-provider routing bullet) — source.
  - `.opencode/skills/creating-archetypes/SKILL.md` — destination.
  - `src/lib/go-models.ts` — the durable source-of-truth pointer.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Go routing mechanics present in destination
    Tool: Bash (grep)
    Steps:
      1. grep -Eq 'OPENCODE_GO_API_KEY' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
      2. grep -Eq 'go-models.ts|OpenCodeGo' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
    Expected Result: Go routing content landed in skill
    Evidence: .sisyphus/evidence/round2-task-3-go-routing.txt
  ```

  **Commit**: YES — `docs(skills): receive OpenCodeGo routing mechanics`. Files: `creating-archetypes/SKILL.md`.

- [x] 4. ABSENT #3 — migrate archetype-edit-helpers / enforce_tool_registry / tool-path-never-block → creating-archetypes

  **What to do**:
  - Move the three Key-Conventions blocks that exist ONLY in AGENTS.md INTO `.opencode/skills/creating-archetypes/SKILL.md`:
    - **`enforce_tool_registry` capability flag** (default false; `isToolAllowed()`; the pre-enforcement PATCH gate returning `400 ENFORCE_REGISTRY_INVALID`).
    - **Archetype editing shared helpers** (`mapArchetypeRowToConfig`, `validateProposalFields`, `resolveToolPaths` in `src/gateway/lib/archetype-edit-helpers.ts`).
    - **Tool-path never-block policy** (`validateProposalFields()` coercion/drop behavior; the only `reAsk:true` guard; routes convert to `kind:'question'`).
  - ADD + verify only.

  **Must NOT do**: No `src/workers/` edits. No AGENTS.md deletion here.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: `skill-creator`.

  **Parallelization**: Can Run In Parallel: YES. Blocks: 16. Blocked By: 1.

  **References**:
  - `AGENTS.md` § "Key Conventions" — the three named blocks (source).
  - `.opencode/skills/creating-archetypes/SKILL.md` — destination.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: All three archetype-editing blocks present in destination
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'enforce_tool_registry' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
      2. grep -Fq 'archetype-edit-helpers' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
      3. grep -Fq 'never-block' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
    Expected Result: all three blocks landed
    Evidence: .sisyphus/evidence/round2-task-4-archetype-edit.txt
  ```

  **Commit**: YES — `docs(skills): receive archetype-edit helpers, enforce_tool_registry, never-block policy`. Files: `creating-archetypes/SKILL.md`.

- [x] 5. PARTIAL — Slack routing symbols → execution-trace-debugging; unescape-args → adding-shell-tools

  **What to do**:
  - The destinations have prose but are MISSING specifics. Add to `.opencode/skills/execution-trace-debugging/SKILL.md` the Slack @mention routing algorithm specifics: `findManyByExternalId('slack', team_id)`, `resolveEmployeesAcrossTenants()`, `routeToEmployee()`, the `TRIGGER_CONFIRM/TRIGGER_CANCEL/TRIGGER_DISAMBIGUATE` action IDs, and the `pendingInputCollections` Map.
  - Add to `.opencode/skills/adding-shell-tools/SKILL.md` the **`unescapeShellArg`** utility convention (`src/worker-tools/lib/unescape-args.ts` — wrap every free-text CLI arg; `\n`→newline etc.; the literal-backslash-n failure mode).
  - ADD + verify only.

  **Must NOT do**: No `src/workers/` edits. No AGENTS.md deletion here.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: `skill-creator`.

  **Parallelization**: Can Run In Parallel: YES. Blocks: 12, 16. Blocked By: 1.

  **References**:
  - `AGENTS.md` § "OpenCode Worker" (Slack @mention triggering bullet; unescape-args utility) — source.
  - `.opencode/skills/execution-trace-debugging/SKILL.md`, `.opencode/skills/adding-shell-tools/SKILL.md` — destinations.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Routing symbols + unescape util present in destinations
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'resolveEmployeesAcrossTenants' .opencode/skills/execution-trace-debugging/SKILL.md && echo PASS
      2. grep -Fq 'TRIGGER_DISAMBIGUATE' .opencode/skills/execution-trace-debugging/SKILL.md && echo PASS
      3. grep -Fq 'unescapeShellArg' .opencode/skills/adding-shell-tools/SKILL.md && echo PASS
    Expected Result: all specifics landed
    Evidence: .sisyphus/evidence/round2-task-5-routing-unescape.txt
  ```

  **Commit**: YES — `docs(skills): receive Slack routing symbols + unescape-args convention`. Files: `execution-trace-debugging/SKILL.md`, `adding-shell-tools/SKILL.md`.

- [x] 6. PARTIAL — role_name derivation / intent-level steps / converse-create internals → creating-archetypes + employee-creation-debugging

  **What to do**:
  - Add to `.opencode/skills/creating-archetypes/SKILL.md`: the **intent-level steps convention** (generated steps are plain-English prose; worker resolves tool commands at runtime; `$NOTIFICATION_CHANNEL`/`$PUBLISH_CHANNEL` placeholders; the submit-output `--draft-file` closer) and the **`role_name` CREATE-path derivation** (kebab-case slug auto-derive, `employee-<short-id>` fallback, EDIT path forbids changing role_name).
  - Add to `.opencode/skills/employee-creation-debugging/SKILL.md`: the **converse-create / propose-edit internals** (request-stateless transcript, discriminated union `question|proposal|no_change|too_long`, 5-question backstop, allowlist differences).
  - ADD + verify only.

  **Must NOT do**: No `src/workers/` edits. No AGENTS.md deletion here.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: `skill-creator`.

  **Parallelization**: Can Run In Parallel: YES. Blocks: 13. Blocked By: 1.

  **References**:
  - `AGENTS.md` § "Adding a New Employee" (role_name CREATE path, intent-level steps convention) + § "Dashboard URLs" (AI Assistant tab, converse-create) — source.
  - `.opencode/skills/creating-archetypes/SKILL.md`, `.opencode/skills/employee-creation-debugging/SKILL.md` — destinations.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Employee-creation internals present in destinations
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'intent-level' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
      2. grep -Fq 'role_name' .opencode/skills/creating-archetypes/SKILL.md && echo PASS
      3. grep -Fq 'converse-create' .opencode/skills/employee-creation-debugging/SKILL.md && echo PASS
    Expected Result: all internals landed
    Evidence: .sisyphus/evidence/round2-task-6-creation-internals.txt
  ```

  **Commit**: YES — `docs(skills): receive role_name/intent-steps/converse-create internals`. Files: `creating-archetypes/SKILL.md`, `employee-creation-debugging/SKILL.md`.

- [x] 7. PARTIAL — ToolDescriptor / ALL_TOOL_DESCRIPTORS specifics → adding-shell-tools + data-access-conventions

  **What to do**:
  - Add to `.opencode/skills/adding-shell-tools/SKILL.md` (or `data-access-conventions` if it fits better — pick the one whose existing prose already covers tool discovery): the **typed `ToolDescriptor` + startup-cached discovery** specifics (every tool exports `descriptor: ToolDescriptor` from `src/worker-tools/lib/types.ts`; `ALL_TOOL_DESCRIPTORS` static array in `src/lib/tool-registry.ts`; `discoverTools()` cache; the "add to ALL_TOOL_DESCRIPTORS" step) and the **`requireEnv()`/`optionalEnv()` in worker tools** rule.
  - ADD + verify only.

  **Must NOT do**: No `src/workers/` edits. No AGENTS.md deletion here.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: `skill-creator`.

  **Parallelization**: Can Run In Parallel: YES. Blocks: 16. Blocked By: 1.

  **References**:
  - `AGENTS.md` § "Key Conventions" (Typed ToolDescriptor block; requireEnv/optionalEnv block) — source.
  - `.opencode/skills/adding-shell-tools/SKILL.md`, `.opencode/skills/data-access-conventions/SKILL.md` — destinations.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: ToolDescriptor + requireEnv specifics present
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'ALL_TOOL_DESCRIPTORS' .opencode/skills/adding-shell-tools/SKILL.md && echo PASS
      2. grep -Eq 'requireEnv|optionalEnv' .opencode/skills/adding-shell-tools/SKILL.md && echo PASS
    Expected Result: tool-registry + env-access specifics landed
    Evidence: .sisyphus/evidence/round2-task-7-tooldescriptor.txt
  ```

  **Commit**: YES — `docs(skills): receive ToolDescriptor discovery + requireEnv worker-tool rule`. Files: `adding-shell-tools/SKILL.md` (and/or `data-access-conventions/SKILL.md`).

- [x] 8. PARTIAL — E2E pre-flight scripts + scenario tables → e2e-testing + feature-verification

  **What to do**:
  - Move the **bash script blocks** from AGENTS.md's two E2E sections (single-gateway pre-flight, live-log-tail, gateway-stability check, the Slack self-test sequence) and the **scenario-guide tables** (the A–F / AC1–AC8 minimum-scenario mappings) INTO `.opencode/skills/e2e-testing/SKILL.md`, with the verification-checklist parts into `.opencode/skills/feature-verification/SKILL.md` where they fit.
  - Keep in AGENTS.md (for Task 18) only the loud MANDATE prose + a pointer to these skills.
  - ADD + verify only.

  **Must NOT do**: No `src/workers/` edits. No AGENTS.md deletion here. Do NOT weaken the mandate wording when copying.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: `skill-creator`.

  **Parallelization**: Can Run In Parallel: YES. Blocks: 18. Blocked By: 1.

  **References**:
  - `AGENTS.md` §§ "Post-Implementation E2E Testing" + "Plan E2E Validation" — source (scripts + scenario tables).
  - `.opencode/skills/e2e-testing/SKILL.md`, `.opencode/skills/feature-verification/SKILL.md` — destinations.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Pre-flight scripts + scenario tables present in e2e-testing
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'src/gateway/server.ts' .opencode/skills/e2e-testing/SKILL.md && echo PASS   # pre-flight script landed
      2. grep -Eq 'Socket Mode connected' .opencode/skills/e2e-testing/SKILL.md && echo PASS
      3. grep -Eq 'AC1|Scenario A' .opencode/skills/e2e-testing/SKILL.md && echo PASS           # scenario table landed
    Expected Result: scripts + scenario tables landed
    Evidence: .sisyphus/evidence/round2-task-8-e2e-scripts.txt
  ```

  **Commit**: YES — `docs(skills): receive E2E pre-flight scripts + scenario tables`. Files: `e2e-testing/SKILL.md`, `feature-verification/SKILL.md`.

- [x] 9. Auth deep content → security skill / user-auth-rbac doc

  **What to do**:
  - Confirm-or-add into `.opencode/skills/security/SKILL.md` (round 1 already added RBAC tables — VERIFY first, add only what's missing): middleware resolution order, JWT dual-env profiles (LOCAL HS256 vs CLOUD ES256), Supabase opaque key model, the 3 authz guards (`requireAuth`/`requireTenantRole`/`requirePermission`), and the bootstrap-first-PLATFORM_OWNER procedure. Where `docs/guides/2026-06-09-1448-user-auth-rbac.md` already covers these, a pointer suffices — do not duplicate.
  - ADD/verify only; deletion is Task 14.

  **Must NOT do**: No `src/workers/` edits. No AGENTS.md deletion here. Do NOT duplicate content already in the user-auth-rbac doc — point to it.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: `skill-creator`.

  **Parallelization**: Can Run In Parallel: YES. Blocks: 14. Blocked By: 1.

  **References**:
  - `AGENTS.md` § "Authentication & Authorization" — source.
  - `.opencode/skills/security/SKILL.md` — destination (already has RBAC tables from round 1).
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` — existing deep doc (point, don't duplicate).

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Auth deep content present in security skill (or pointed to doc)
    Tool: Bash (grep)
    Steps:
      1. grep -Eq 'requireTenantRole|requirePermission' .opencode/skills/security/SKILL.md && echo PASS
      2. grep -Eq 'HS256|ES256|JWKS' .opencode/skills/security/SKILL.md && echo PASS
      3. grep -Fq 'PLATFORM_OWNER' .opencode/skills/security/SKILL.md && echo PASS
    Expected Result: middleware/JWT/key-model/guards/bootstrap present in skill or explicitly pointed to the doc
    Evidence: .sisyphus/evidence/round2-task-9-auth.txt
  ```

  **Commit**: YES — `docs(skills): receive auth middleware/JWT/key-model/guards/bootstrap`. Files: `security/SKILL.md`.

- [x] 10. AGENTS.md — restructure Skills System into ONE dispatch table + add meta-instruction

  **What to do**:
  - Collapse the Skills System section to a SINGLE skill-dispatch table ("If you are about to… → Load this skill"). DELETE the two description tables (Employee skills + Dev skills) — their descriptions already live in each `SKILL.md` frontmatter. DELETE the separate "Detailed Topics → Skills" table (merge any unique rows into the one dispatch table).
  - Move the skill-system internals prose (skill-registry, tool-usage-reference generation, Composio skill system, custom per-service skill system) to a one-line pointer ("Skill generation/registry internals → `creating-archetypes`/`adding-shell-tools` skills").
  - **ADD the meta-instruction** near the top of AGENTS.md (just under the intro blockquote): "**Before editing ANY file, check the dispatch table below and load the matching skill FIRST — this is mandatory, not advisory.**"

  **Must NOT do**: Do NOT remove the dispatch routing for any domain that has a migrated rule. Do NOT delete the worker/dev skill DISTINCTION note if it's load-bearing for "rebuild Docker vs commit" — keep a one-liner.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (first AGENTS.md edit; serialized). Blocks: 11-20. Blocked By: 1.

  **References**:
  - `AGENTS.md` § "Skills System" + § "Detailed Topics → Skills" — edit locations.
  - `.sisyphus/evidence/round2-reconciliation.md` — log each removed table.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: One dispatch table + meta-instruction; description tables gone
    Tool: Bash (grep)
    Steps:
      1. grep -c 'Load this skill' AGENTS.md  → 1 (single dispatch table header)
      2. grep -c '## Detailed Topics' AGENTS.md  → 0 (merged/removed)
      3. grep -Eiq 'before editing any file.*load' AGENTS.md && echo PASS  (meta-instruction present)
      4. Confirm dispatch table still has a row routing to react-dashboard, security, creating-archetypes, e2e-testing, adding-shell-tools (every migrated domain)
    Expected Result: single dispatch table; meta-instruction added; description tables removed; routing preserved
    Evidence: .sisyphus/evidence/round2-task-10-dispatch.txt
  ```

  **Commit**: YES — `docs(agents): collapse skills to one dispatch table; add load-skill-first meta-instruction`. Files: `AGENTS.md`.

- [x] 11. AGENTS.md — trim Approved LLM Models (keep constraint loud; delete migrated catalog/quirks/Go-routing)

  **What to do**:
  - KEEP LOUD inline: the two-category rule (execution = catalog model; verification = `gateway_llm_model`, default `deepseek/deepseek-v4-flash`), the FORBIDDEN-hardcoded-model rule, and the VM-size CRITICAL (performance-1x requirement).
  - DELETE (now in skills via Tasks 2-3): the seeded catalog list, per-model reliability quirks, OpenCodeGo routing mechanics. Replace with one-line pointers to `creating-archetypes`/`e2e-testing` + `src/lib/go-models.ts`.
  - Keep the retired-engineering-employee one-liner.

  **Must NOT do**: Do NOT weaken the FORBIDDEN rule or the VM-size CRITICAL. Do NOT delete before Tasks 2-3 verified present (they are dependencies).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — deletion with preservation judgment.
  - **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 12. Blocked By: 2, 3, 10.

  **References**:
  - `AGENTS.md` § "Approved LLM Models" — edit location.
  - `.sisyphus/evidence/round2-task-2-catalog.txt`, `round2-task-3-go-routing.txt` — proof content landed.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Constraint loud, migrated detail gone
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'NEVER VIOLATE' AGENTS.md && echo PASS  (constraint header intact)
      2. grep -Fq 'performance-1x' AGENTS.md && echo PASS  (VM-size CRITICAL intact)
      3. grep -Fq 'anthropic/claude-sonnet' AGENTS.md && echo PASS  (FORBIDDEN list intact)
      4. Catalog list reduced to a pointer: grep -c 'zhipu/glm-5.1' AGENTS.md  → 0 (moved to skill)
    Expected Result: rule loud; catalog/quirks/Go-routing migrated out
    Evidence: .sisyphus/evidence/round2-task-11-models.txt
  ```

  **Commit**: YES — `docs(agents): trim model catalog/quirks/Go-routing to pointers; keep constraint loud`. Files: `AGENTS.md`.

- [x] 12. AGENTS.md — trim OpenCode Worker (keep map/lifecycle/inngest/contract/pin; delete migrated mechanics)

  **What to do**:
  - KEEP: harness file pointers, the shell-tools directory table (useful index), the lifecycle state list, the active inngest-function list, the output-contract invariant, the OpenCode `1.14.31` version pin.
  - DELETE (now in skills via Tasks 3, 5): the full Slack @mention routing algorithm (→ pointer to `execution-trace-debugging`), the unescape-args utility paragraph (→ pointer to `adding-shell-tools`), the multi-provider routing internals (→ pointer to `creating-archetypes`).

  **Must NOT do**: Do NOT delete the version pin, lifecycle list, inngest list, or output-contract invariant. Do NOT delete before Tasks 3 & 5 verified.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 13. Blocked By: 3, 5, 11.

  **References**:
  - `AGENTS.md` § "OpenCode Worker" — edit location.
  - `.sisyphus/evidence/round2-task-3-go-routing.txt`, `round2-task-5-routing-unescape.txt` — proof landed.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Worker invariants kept, mechanics migrated out
    Tool: Bash (grep)
    Steps:
      1. grep -Fq '1.14.31' AGENTS.md && echo PASS  (pin intact)
      2. grep -Fq 'submit-output.ts' AGENTS.md && echo PASS  (output contract intact)
      3. grep -c 'resolveEmployeesAcrossTenants' AGENTS.md  → 0 (routing moved)
      4. grep -c 'unescapeShellArg' AGENTS.md  → 0 (unescape moved)
    Expected Result: invariants kept; routing/unescape/multi-provider migrated out
    Evidence: .sisyphus/evidence/round2-task-12-worker.txt
  ```

  **Commit**: YES — `docs(agents): trim worker routing/unescape/multi-provider to pointers`. Files: `AGENTS.md`.

- [x] 13. AGENTS.md — trim Adding-Employee / Tenants / Dashboard URLs to skeletons + tripwires

  **What to do**:
  - **Adding a New Employee**: keep the wizard one-liner + the manual-seed numbered checklist + the approval-gate note. DELETE the role_name-derivation paragraph and the intent-level-steps paragraph (→ tripwire pointer: "Creating/editing an employee → load `creating-archetypes` FIRST").
  - **Tenants**: keep the tenant-ID table, the Papi-Chulo clarification, the two-VLRE-tokens gotcha. Trim the routing prose to a pointer (`docs/guides/2026-05-14-0040-slack-tenant-integration.md`).
  - **Dashboard URLs**: keep the URL table + the task-logs + wizard URLs. DELETE the long AI-Assistant-tab and converse-create essays (→ pointer to `employee-creation-debugging`).

  **Must NOT do**: Do NOT delete the tenant-ID table, Papi-Chulo note, or two-tokens gotcha (operational essentials). Do NOT delete before Tasks 2 & 6 verified.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 14. Blocked By: 2, 6, 12.

  **References**:
  - `AGENTS.md` §§ "Adding a New Employee", "Tenants", "Dashboard URLs" — edit locations.
  - `.sisyphus/evidence/round2-task-6-creation-internals.txt` — proof landed.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Skeletons + gotchas kept, essays migrated out
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'Papi Chulo' AGENTS.md && echo PASS  (clarification kept)
      2. grep -Fq 'VLRE_SLACK_BOT_TOKEN' AGENTS.md && echo PASS  (two-tokens gotcha kept)
      3. grep -c 'buildConverseSystemPromptPre' AGENTS.md  → 0 (role_name internals moved)
      4. grep -Eiq 'creating-archetypes' AGENTS.md && echo PASS  (tripwire pointer present)
    Expected Result: skeletons + gotchas intact; deep prose migrated; tripwire present
    Evidence: .sisyphus/evidence/round2-task-13-employee-tenant-dash.txt
  ```

  **Commit**: YES — `docs(agents): trim employee/tenant/dashboard prose to skeletons + pointers`. Files: `AGENTS.md`.

- [x] 14. AGENTS.md — collapse Auth section to ~5-line core + pointer

  **What to do**:
  - KEEP inline: the two token types (SERVICE_TOKEN + Supabase JWT), the never-violate "all `/admin/*` and `/me` need `Authorization: Bearer`" rule, and the role rank order (`OWNER>ADMIN>MEMBER>VIEWER`).
  - DELETE (now in security skill / user-auth-rbac doc via Task 9): middleware resolution order, JWT dual-env profiles, Supabase key model, RBAC role/permission tables, bootstrap procedure. Replace with a tripwire pointer: "Auth/RBAC/secrets work → load `security` FIRST; full flow in `docs/guides/2026-06-09-1448-user-auth-rbac.md`."

  **Must NOT do**: Do NOT delete the Bearer-token mandate or rank order. Do NOT delete before Task 9 verified.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 15. Blocked By: 9, 13.

  **References**:
  - `AGENTS.md` § "Authentication & Authorization" — edit location.
  - `.sisyphus/evidence/round2-task-9-auth.txt` — proof landed.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Auth core kept, deep content migrated out
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'Authorization: Bearer' AGENTS.md && echo PASS  (mandate kept)
      2. grep -Eq 'OWNER.*ADMIN.*MEMBER.*VIEWER' AGENTS.md && echo PASS  (rank order kept)
      3. grep -c 'detectEnvProfile' AGENTS.md  → 0 (JWT profile internals moved)
      4. grep -Fq 'security' AGENTS.md && echo PASS  (tripwire pointer present)
    Expected Result: core kept; middleware/JWT/key-model/RBAC/bootstrap migrated; pointer present
    Evidence: .sisyphus/evidence/round2-task-14-auth.txt
  ```

  **Commit**: YES — `docs(agents): collapse auth to core + security-skill pointer`. Files: `AGENTS.md`.

- [x] 15. AGENTS.md — trim Database to connection + invariants + settings-keys; point columns to schema.prisma

  **What to do**:
  - KEEP inline: DB name/connection string, PostgREST URL, the test-DB safety guard, the soft-delete reminder, and the `platform_settings` KEYS list (behavioral — affects runtime).
  - DELETE the per-table column-by-column dumps (~10 tables). Replace with a one-line pointer: "Table schemas → `prisma/schema.prisma` (source of truth) + load `prisma` skill." Keep a glance-able list of table NAMES only if it aids navigation (no columns).
  - Keep the Database Backup MANDATORY one-liner + production-ops pointer (from round 1).

  **Must NOT do**: Do NOT delete the soft-delete reminder, test-DB guard, or platform_settings keys. Do NOT introduce volatile counts.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 16. Blocked By: 14.

  **References**:
  - `AGENTS.md` § "Database" — edit location.
  - `prisma/schema.prisma` — the durable source-of-truth pointer; `.opencode/skills/prisma/SKILL.md`.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Connection + invariants + settings-keys kept; column dumps gone
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'ai_employee_test' AGENTS.md && echo PASS  (test-DB guard kept)
      2. grep -Fq 'gateway_llm_model' AGENTS.md && echo PASS  (platform_settings keys kept)
      3. grep -Fq 'schema.prisma' AGENTS.md && echo PASS  (pointer present)
      4. grep -c 'archetype_generation_calls' AGENTS.md  → at most 1 (column dump removed; name-only ok)
    Expected Result: invariants kept; column dumps replaced by schema.prisma pointer
    Evidence: .sisyphus/evidence/round2-task-15-database.txt
  ```

  **Commit**: YES — `docs(agents): trim DB column dumps to schema.prisma pointer; keep invariants`. Files: `AGENTS.md`.

- [x] 16. AGENTS.md — split Key Conventions (universal inline; domain rules → tripwire pointers)

  **What to do**:
  - KEEP inline (UNIVERSAL — never migrate): exactly-two-things injection, discover-before-build, multi-tenancy-mandatory, shared-files-employee-agnostic, soft-deletes-only, /tmp-tools-only, World-A/World-B output-contract, knowledge_base snake_case exception, Zod UUID_REGEX, platform-settings-over-env-vars, AI-employee-outputs-concise, end-user-language-non-technical.
  - MIGRATE to destinations (verified in Tasks 4, 5, 7) + leave a **TRIPWIRE** one-liner each:
    - SearchableSelect + card-shells + URL-state → `react-dashboard`. Tripwire: "Editing dashboard UI → load `react-dashboard` FIRST; SearchableSelect + card-shells + URL-encoded-state are hard-enforced."
    - requireEnv/optionalEnv + ToolDescriptor → `adding-shell-tools`. Tripwire: "Adding a shell tool → load `adding-shell-tools` FIRST; export a `descriptor` + use requireEnv()."
    - archetype-edit-helpers + enforce_tool_registry + never-block → `creating-archetypes`. Tripwire: "Editing archetype routes/helpers → load `creating-archetypes` FIRST."
    - sendError/sendSuccess → `api-design`. Tripwire: "Adding a gateway route → load `api-design` FIRST; use sendError()/sendSuccess()."
    - gateway-proxied set-password → keep inline (security-critical, universal-ish) OR tripwire to `security`.
  - Each tripwire NAMES the rule so the agent knows it's about to break something.

  **Must NOT do**: Do NOT delete any UNIVERSAL rule. Do NOT migrate an always-violated rule WITHOUT leaving a tripwire. Do NOT delete before Tasks 4, 5, 7 verified.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — highest-judgment split (universal vs domain + tripwire authoring).
  - **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 17. Blocked By: 4, 5, 7, 15.

  **References**:
  - `AGENTS.md` § "Key Conventions" — edit location.
  - `.sisyphus/evidence/round2-critical-rule-inventory.txt` — the UNIVERSAL vs DOMAIN classification from Task 1.
  - `.sisyphus/evidence/round2-task-4/5/7-*.txt` — proof domain content landed.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Universal kept inline; domain rules → tripwires
    Tool: Bash (grep)
    Steps:
      1. grep -Fq 'Soft deletes only' AGENTS.md && echo PASS  (universal kept)
      2. grep -Fq 'employee-agnostic' AGENTS.md && echo PASS  (universal kept)
      3. grep -Fq 'World-A' AGENTS.md && echo PASS  (cross-world invariant kept)
      4. For each migrated always-violated rule, a tripwire exists: grep -Eiq 'dashboard UI.*react-dashboard.*FIRST' AGENTS.md && echo PASS
      5. grep -c 'SearchableSelect.*from.*searchable-select.tsx' AGENTS.md  → 0 (full rule body moved; tripwire remains)
    Expected Result: universal rules intact; every migrated always-violated rule has a named tripwire
    Evidence: .sisyphus/evidence/round2-task-16-key-conventions.txt
  ```

  **Commit**: YES — `docs(agents): keep universal conventions; convert domain rules to tripwire pointers`. Files: `AGENTS.md`.

- [x] 17. AGENTS.md — trim Project Structure tree to one-line-per-dir + load-bearing files

  **What to do**:
  - Keep the tree with a SHORT purpose per directory. Name ONLY load-bearing files agents must know exist (e.g. `events.ts` "import event types here", `postgrest-headers.ts` "makePostgrestHeaders factory", `http-response.ts` "sendError/sendSuccess").
  - DELETE the exhaustive per-file role essays — especially the `workers/lib/` ~20-file enumeration and the `gateway/services/` paragraph. Replace with "Browse the dir + load the relevant skill for detail."

  **Must NOT do**: Do NOT introduce volatile counts. Do NOT delete the directory-level structure (navigation value). Keep the durability rule (enumerate-not-count) satisfied by keeping the dir list itself.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 18. Blocked By: 16.

  **References**:
  - `AGENTS.md` § "Project Structure" — edit location.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Tree kept, per-file essays removed
    Tool: Bash (grep/wc)
    Steps:
      1. grep -Fq 'postgrest-headers.ts' AGENTS.md && echo PASS  (load-bearing file still named)
      2. grep -c 'approval-card-poster.mts' AGENTS.md  → 0 (workers/lib essay removed)
      3. Confirm the top-level dir list (gateway/ inngest/ workers/ repositories/ worker-tools/ lib/) still present
    Expected Result: navigation tree kept; exhaustive file essays removed
    Evidence: .sisyphus/evidence/round2-task-17-structure.txt
  ```

  **Commit**: YES — `docs(agents): trim project-structure tree to dirs + load-bearing files`. Files: `AGENTS.md`.

- [x] 18. AGENTS.md — collapse both E2E sections to the loud mandate + skill pointers

  **What to do**:
  - Collapse the two E2E sections (Post-Implementation E2E + Plan E2E Validation) into ONE tight "E2E Testing (MANDATORY)" block that KEEPS LOUD: must run live E2E yourself, "code looks correct" is insufficient, Slack-trigger changes require the single-gateway pre-flight + live @mention → Confirm → Done, "verified-from-code is explicitly insufficient."
  - DELETE the embedded bash scripts (pre-flight, log-tail, stability) and the scenario-guide tables (now in `e2e-testing`/`feature-verification` via Task 8). Replace with a pointer.

  **Must NOT do**: Do NOT weaken the mandate wording. Do NOT delete before Task 8 verified.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 19. Blocked By: 8, 17.

  **References**:
  - `AGENTS.md` §§ "Post-Implementation E2E Testing", "Plan E2E Validation" — edit locations.
  - `.sisyphus/evidence/round2-task-8-e2e-scripts.txt` — proof scripts/tables landed.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Mandate kept loud; scripts/tables migrated out
    Tool: Bash (grep)
    Steps:
      1. grep -Eiq 'live.*@mention|run.*live.*E2E|MANDATORY' AGENTS.md && echo PASS  (mandate kept)
      2. grep -Fq 'verified from code' AGENTS.md || grep -Fiq 'insufficient' AGENTS.md && echo PASS
      3. grep -c 'pgrep -f' AGENTS.md  → 0 (pre-flight script moved)
      4. grep -Fq 'e2e-testing' AGENTS.md && echo PASS  (pointer present)
    Expected Result: mandate loud; scripts + scenario tables migrated; pointer present
    Evidence: .sisyphus/evidence/round2-task-18-e2e.txt
  ```

  **Commit**: YES — `docs(agents): collapse E2E sections to mandate + skill pointers`. Files: `AGENTS.md`.

- [x] 19. AGENTS.md — drop Future Work backlog; prune + trim Reference Documents table; verify Telegram untouched

  **What to do**:
  - DELETE the "Future Work (Backlog — Not in Current Plan)" section entirely (project-tracking, not agent-guidance).
  - Reference Documents table: PRUNE stale/superseded/historical rows (e.g. closed research spikes, old architecture snapshots that newer docs supersede, completed-phase planning docs) — verify each pruned row's content is covered elsewhere or genuinely archival. TRIM each surviving "When to Read" cell to a terse trigger phrase.
  - **VERIFY the Telegram Notifications section is byte-identical to baseline** (user override — must NOT be trimmed). Do not edit it; just confirm.

  **Must NOT do**: Do NOT touch the Telegram section. Do NOT prune a Reference row whose target is the ONLY source for live operational detail. Do NOT introduce volatile counts.

  **Recommended Agent Profile**:
  - **Category**: `writing`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized). Blocks: 20. Blocked By: 18.

  **References**:
  - `AGENTS.md` §§ "Future Work", "Reference Documents", "Prometheus Planning — Telegram Notifications" — edit locations.
  - `git show <baseline>:AGENTS.md` — to diff the Telegram section for byte-identity.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Future Work gone; Reference trimmed; Telegram intact
    Tool: Bash (grep/diff)
    Steps:
      1. grep -c '## Future Work' AGENTS.md  → 0
      2. Confirm Reference Documents table still present with fewer rows + shorter cells
      3. Telegram byte-identity: extract the Telegram section from baseline and current, diff → empty
      4. grep -Fq 'telegram-notify.ts' AGENTS.md && echo PASS  (Telegram rules intact)
    Expected Result: Future Work removed; Reference pruned+trimmed; Telegram unchanged
    Evidence: .sisyphus/evidence/round2-task-19-refs-telegram.txt
  ```

  **Commit**: YES — `docs(agents): drop future-work backlog; prune+trim reference table`. Files: `AGENTS.md`.

- [x] 20. AGENTS.md — tripwire-coverage audit pass

  **What to do**:
  - Cross-check the Task-1 critical-rule inventory: for EVERY rule classified DOMAIN that was migrated AND is flagged always-violated-by-default (dashboard rules, sendError/sendSuccess, requireEnv, ToolDescriptor, archetype-edit), confirm a one-line tripwire pointer exists inline in AGENTS.md (in Key Conventions or the dispatch table) that NAMES the rule + commands loading the skill.
  - Confirm the top-of-file meta-instruction ("load the matching skill before editing") is present.
  - Add any missing tripwire. Update the TOC if section names changed across Tasks 10-19.

  **Must NOT do**: Do NOT re-expand a migrated rule's full body — tripwires are ONE line. Do NOT add new rules.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`. **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (serialized — final AGENTS.md edit). Blocks: 21. Blocked By: 19.

  **References**:
  - `.sisyphus/evidence/round2-critical-rule-inventory.txt` — the migrated-always-violated list.
  - `AGENTS.md` — TOC + Key Conventions + dispatch table.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Every migrated always-violated rule has a tripwire; TOC current
    Tool: Bash (grep)
    Steps:
      1. grep -Eiq 'dashboard.*react-dashboard.*FIRST' AGENTS.md && echo PASS
      2. grep -Eiq 'gateway route.*api-design' AGENTS.md && echo PASS
      3. grep -Eiq 'shell tool.*adding-shell-tools' AGENTS.md && echo PASS
      4. grep -Eiq 'before editing any file.*load' AGENTS.md && echo PASS  (meta-instruction)
      5. Confirm TOC anchors match current H2 section names (no dead anchors)
    Expected Result: full tripwire coverage; meta-instruction present; TOC accurate
    Evidence: .sisyphus/evidence/round2-task-20-tripwires.txt
  ```

  **Commit**: YES — `docs(agents): ensure tripwire coverage + refresh TOC`. Files: `AGENTS.md`.

- [x] 21. Reconciliation completion + all gates + before/after delta

  **What to do**:
  - Complete the reconciliation artifact: for EVERY block removed from AGENTS.md across Tasks 10-20, fill `verified-present? = YES` (with the grep that proves it) and a verdict `{kept-inline | moved-to:<dest> | dropped-as-dead:<reason>}`. ZERO unaccounted removals.
  - Run the FULL gate battery: worker-scope `git diff` gate; no-source-edits gate; per-mapping destination greps (all 12); semantic-constant grep -F battery; verbatim-string grep -F battery (all 10); Telegram byte-identity; dangling-pointer scan of `.opencode/skills/`; markdown table-render sanity; dispatch-coverage check.
  - Record before/after `wc -l` + `wc -w` delta.

  **Must NOT do**: Do NOT modify content here — verification only. If a gate fails, report for a fix task; do not silently patch.

  **Recommended Agent Profile**:
  - **Category**: `quick` — running gates + assembling reconciliation.
  - **Skills**: none.

  **Parallelization**: Can Run In Parallel: NO (final verification). Blocks: F1-F3. Blocked By: 2-20.

  **References**:
  - `.sisyphus/evidence/round2-reconciliation.md`, `round2-critical-rule-inventory.txt`, `round2-constants.txt`, `round2-verbatim.txt` — the baselines.
  - All Definition-of-Done commands in this plan.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: All gates pass; reconciliation clean
    Tool: Bash (grep/grep -F/diff/wc/git)
    Steps:
      1. git diff --name-only | grep -q 'src/workers/' && echo FAIL || echo PASS
      2. git diff --name-only | grep -qE '\.(ts|json|prisma)$' && echo FAIL || echo PASS
      3. For all 12 mappings: grep -F the migrated symbol in its destination → all PASS
      4. For all semantic constants: grep -Fq in AGENTS.md → all PASS
      5. For all 10 verbatim strings: grep -Fq in AGENTS.md → all PASS
      6. Telegram section diff vs baseline → empty
      7. grep -rn 'listed in AGENTS.md\|see AGENTS.md §' .opencode/skills/ → only live targets
      8. reconciliation shows zero unaccounted removals
    Expected Result: all gates green; reconciliation clean
    Evidence: .sisyphus/evidence/round2-task-21-gates.txt, round2-reconciliation.md

  Scenario: Materially smaller (evidence)
    Tool: Bash (wc)
    Steps:
      1. Compare git show <baseline>:AGENTS.md | wc -l vs wc -l AGENTS.md
    Expected Result: materially fewer lines/words; delta recorded
    Evidence: .sisyphus/evidence/round2-task-21-delta.txt
  ```

  **Commit**: NO (verification artifacts only; may commit evidence).

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never mark F1-F3 checked before user okay.

- [x] F1. **Information-Preservation Audit** — `oracle`
      Read the committed baseline `AGENTS.md` (`git show <baseline>:AGENTS.md`), the current `AGENTS.md`, the reconciliation artifact, and the captured inventories. For EVERY rule containing MANDATORY/CRITICAL/NEVER/MUST/FORBIDDEN/⚠️ in the baseline, confirm it is either still inline OR mapped in the reconciliation to a destination that GREP-CONFIRMS the content is present. Specifically audit R1: list every always-violated-by-default rule that was migrated and confirm a one-line tripwire pointer remains inline. Confirm all semantic constants + the 10 verbatim strings survive, and the Telegram section is byte-identical.
      Output: `Critical rules [N/N accounted] | Semantic constants [N/N present] | Verbatim strings [10/10] | Tripwires [N/N migrated-always-violated] | Telegram [byte-identical] | VERDICT: APPROVE/REJECT`

- [x] F2. **Doc Accuracy + Markdown Quality** — `unspecified-high`
      For each of the 12 migration mappings, grep the destination skill/doc and confirm the migrated symbol/command/table is present. Confirm zero dangling `see AGENTS.md §`/`listed in AGENTS.md` pointers to deleted sections remain in `.opencode/skills/`. Confirm markdown tables render (no broken rows). Confirm the single skill-dispatch table still routes every domain that had a migrated rule. Confirm no new volatile counts were introduced. Run `pnpm lint` if it covers markdown.
      Output: `Mappings verified [12/12] | Dangling pointers [0] | Dispatch coverage [N/N domains] | Markdown [PASS/FAIL] | New counts [NONE] | VERDICT`

- [x] F3. **Scope Fidelity Check** — `deep`
      `git diff --name-only` the full change set. Confirm ONLY `AGENTS.md` + the in-scope `.opencode/skills/*/SKILL.md` files (+ optionally the user-auth-rbac doc + `.sisyphus/*`) were touched. Assert ZERO `src/workers/` paths and ZERO `.ts`/`.json`/`.prisma` edits. Confirm no new skill folder was created. Confirm universal rules were NOT deleted. Report before/after `wc -l` delta.
      Output: `Files touched [in-scope only] | Worker paths [0] | Source edits [0] | New skills [0] | Universal rules [intact] | Delta [N lines] | VERDICT`

-> Present F1-F3 results -> Get explicit user okay before completing.

- [x] 22. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.
  - Run: `pnpm exec tsx scripts/telegram-notify.ts "✅ AGENTS.md leanness round 2 complete — migrated domain detail into skills, router-style file, zero rule loss verified. Come back to review."`
  - Run ONLY after F1-F3 APPROVE and the user has given explicit okay.

---

## Commit Strategy

- Wave 2: one commit per destination-skill task (`docs(skills): receive <topic> migrated from AGENTS.md`).
- Wave 3: one commit per AGENTS.md edit task for reviewable, revertable history (`docs(agents): <what>`).
- Task 1 commits the untouched baseline first.
- Message style: `docs(agents|skills): <what>`. No AI/tool attribution. Never `--no-verify`.

## Success Criteria

### Verification Commands

```bash
# Worker scope untouched
git diff --name-only | grep -q 'src/workers/' && echo FAIL || echo PASS
# No source edits
git diff --name-only | grep -qE '\.(ts|json|prisma)$' && echo FAIL || echo PASS
# Semantic constants intact (sample)
grep -Fq 'SYNTHESIS_THRESHOLD = 5' AGENTS.md && grep -Fq '1.14.31' AGENTS.md && echo PASS || echo FAIL
# Verbatim self-demo intact (sample)
grep -Fq 'Active Functions (7)' AGENTS.md && grep -Fq '84 lines' AGENTS.md && echo PASS || echo FAIL
# No dangling pointers in skills
grep -rn 'listed in AGENTS.md\|see AGENTS.md §' .opencode/skills/ || echo 'none'
# Delta
wc -l AGENTS.md   # Expected: materially < 700
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All F1-F3 reviews APPROVE
- [ ] User has given explicit okay
