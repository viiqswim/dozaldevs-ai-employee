# AGENTS.md Cleanup & Reorganization

> **Facts re-verified against live code on 2026-06-15.** This supersedes the earlier (lost, never-committed) `2026-06-14-1802-agents-md-cleanup.md`. All claims below were checked from disk, not assumed.

## TL;DR

> **Quick Summary**: Restructure the repo-root `AGENTS.md` (currently **771 lines / 12,293 words**, injected into every LLM call) by priority, fix all verified-wrong facts, delete dead content/stubs, eliminate volatile counts, add missing module docs, and migrate heavy how-to into existing skills — without losing a single must-never-violate rule.
>
> **Deliverables**:
>
> - A reorganized, lean, fully-accurate `AGENTS.md` (priority-ordered, with a navigation TOC and a single skills-index table)
> - All verified factual errors corrected against live code/DB
> - All volatile-fact violations enumerated-not-counted (per the file's own Durability rule)
> - Heavy how-to content migrated into the relevant `SKILL.md` files (where not already present)
> - `README.md` stale facts corrected
> - A rule-preservation reconciliation artifact proving zero critical rules were silently dropped
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO — sequential (single primary file; edits serialized to avoid clobbering AGENTS.md). A few read-only/independent tasks (skill audit, README) can overlap.
> **Critical Path**: Baseline commit + Critical-Rule Inventory → fix facts / remove dead content / dedup / restructure (serialized on AGENTS.md) → verification gates → README → notify

---

## Context

### Original Request

The repo-root `AGENTS.md` has grown extremely long and stale — content was continuously appended without cleanup. The user wants it reorganized and easier for an AI agent to read, containing all extremely important details, with no outdated and no wrong information.

### Why It Matters

`AGENTS.md` is injected into **every** LLM call on this platform. Every stale fact misleads every agent on every turn; every wasted token costs on every turn. Leanness and accuracy are first-class correctness concerns here.

### Confirmed user decisions

- **Verification depth**: FULL — every factual claim checked against actual code/DB; stale/wrong fixed or removed.
- **Aggressiveness**: AGGRESSIVE — AGENTS.md becomes a lean core (critical invariants + pointers); detailed how-to migrates into skills.
- **Reorg scope**: FULL restructure by priority — most-critical never-violate rules first; related topics grouped; clear navigation/TOC.
- **Backup**: NO separate archive — rely on git history (executor MUST commit the pre-edit baseline first so diff-based verification has a reference).
- **Skill edits**: ALLOWED — executor may edit `SKILL.md` files to receive migrated content. For the 10 existing `[Moved to skill]` stubs, content already lives in skills → verify-before-write, do not duplicate.
- **Stub handling**: DELETE the dead H2 stubs; add ONE compact "Detailed topics → load this skill" index table.
- **Size target**: NONE — qualitative leanness; report before/after line+word delta as evidence.
- **Reference Documents table**: PRUNE completed/superseded plan rows + fix remaining stale labels; verify every kept path exists.
- **README.md**: IN SCOPE — fully fact-fix stale facts (keep its own audience/structure; correct facts only).

### Research Findings — RE-VERIFIED against live code (2026-06-15)

> Each item below was re-checked from disk on regeneration. Line numbers are current as of AGENTS.md at 771 lines.

**P0 wrong facts to FIX (all confirmed still wrong):**

- **Platform settings (line 364)**: "All 8 initial settings have `is_required = true`" — DOUBLY wrong. `prisma/seed.ts` seeds settings where NOT all are required: `issues_slack_channel` and `cost_alert_slack_channel` are `is_required: false`; the rest are `is_required: true`. **FIX WITHOUT INTRODUCING ANY COUNT** (per § Documentation Durability — counts go stale): do NOT write "9 settings" or "7 required". Instead, drop the "All N ... have is_required=true" clause entirely and state the durable property by name — e.g. "Most settings are required; `issues_slack_channel` and `cost_alert_slack_channel` are optional." Keep the enumerated key list as the source of truth.
- **Haiku — SCRUB ENTIRELY (both references, per user policy: Haiku is retired)**:
  - **Line 26** ("Permitted Anthropic model" rule): `anthropic/claude-haiku-4-5` is no longer a sanctioned gateway model. DELETE this standing-permission sentence entirely. The default gateway model is `deepseek/deepseek-v4-flash` (verified in `prisma/seed.ts`); no Anthropic model should be presented as permitted. Confirm no other AGENTS.md text implies Haiku is allowed.
  - **Line 362** ("Haiku-generated estimate"): `src/gateway/services/time-estimator.ts` calls `callLLM({ taskType: 'review' })`, routing through `gateway_llm_model` (default `deepseek/deepseek-v4-flash`). Replace "Haiku-generated estimate" → "generated via the configured gateway LLM model".
  - **Goal**: after this task, `grep -i haiku AGENTS.md` returns ZERO matches.
- **`guest-message-poll` (line 467)**: listed as an active cron trigger, but `src/gateway/inngest/serve.ts` registers exactly 7 functions and `guest-message-poll` is NOT among them. Mark it deregistered (like `daily-summarizer` already is on the same line).
- **"30 utilities" (line 43, Deprecated Components row)**: wrong count AND the orchestrator files are deleted. Removed wholesale when the Deprecated Components table is deleted (Task 5); strip any survivor.

**CORRECTION — dropped false-positive (was P0 #5 in the prior plan):**

- The earlier plan claimed AGENTS.md wrongly says the `1.14.31` OpenCode pin lives in `opencode.json`. **Re-verification shows this is NOT a real error.** AGENTS.md line 96 states the pin with no location; line 99's `opencode.json` reference is solely about `autoupdate: false`, which IS correctly present in `src/workers/config/opencode.json` (verified: file contains `{"permission":...,"autoupdate":false}`, no version field). The version pin lives in the `Dockerfile` (`npm install -g opencode-ai@1.14.31`), and AGENTS.md does not contradict that. **No edit needed here. Do NOT "fix" this.**

**P1 dead content to REMOVE:**

- **Deprecated Components table (line 30)**: all 7 referenced files confirmed MISSING from disk (`src/inngest/lifecycle.ts`, `src/inngest/redispatch.ts`, `src/workers/generic-harness.mts`, `src/workers/tools/registry.ts`, `src/inngest/watchdog.ts`, `src/workers/orchestrate.mts`, `src/workers/entrypoint.sh`). Collapse to a 1-line historical note.
- **10 `[Moved to skill]` stub H2 sections** (verified 10 stub headings, lines 205/209/213/217/301/423/599+603/607/611/638): 4 Slack stubs → `slack-conventions`; Admin API → `api-design`; Render API → `production-ops`; Long-Running Commands + Tmux sub-stub → `long-running-commands`; Known Issues → skills; Task Debugging → `debugging-lifecycle`; Feature Verification Checklist → `feature-verification`. (Note: there are 11 "Moved to skill" string matches but 10 are under stub H2s; one is a sub-section.)
- **`worker-agent-delegation-redesign.md` Reference row (line 739)**: labeled "Active redesign plan (14 tasks across 4 waves)" but superseded by the current OpenCode harness. File exists. Prune or reclassify as historical (see Task 3 status check).

**P2 volatile facts (Durability-rule violations):**

- Line 28: "and 11 others (see `src/lib/go-models.ts`)" → "and others (see `src/lib/go-models.ts`)". `go-models.ts` has 14 entries; 3 named + "11 others" is a volatile count.
- Line 43: "30 utilities" (also P0/P1).
- Line 364: "8 initial settings" (also P0).
- Line 739: "14 tasks across 4 waves" → remove count.

**P3 missing content to ADD:**

- `src/workers/lib/` description omits 12 active files (verified present via `ls`): `approval-card-poster.mts`, `env-manifest-builder.mts`, `failure-codes.ts`, `heartbeat.ts`, `model-provider.mts`, `opencode-server.ts`, `output-contract.mts`, `prompt-assembler.mts`, `resource-caps.ts`, `slack-notifier.mts`, `template-vars.ts`, `trigger-payload.mts`. Enumerate (don't count).

**P4 size/dedup:**

- Database backup shell script (~28 lines) relocatable to `production-ops` skill (or a `docs/guides/` backup guide); keep a 1-line mandate.
- Merge tiny "Platform Vision" + "Current Implementation" sections.
- Slack @mention/channel routing described in BOTH § OpenCode Worker (line 102) and § Tenants — dedup: keep routing algorithm in § OpenCode Worker, keep many-tenants-per-workspace nuance in § Tenants.
- "Rebuild after every worker change" stated in BOTH § OpenCode Worker and § Infrastructure — keep in § Infrastructure.

**CONFIRMED ACCURATE (must NOT change) — re-verified:**

- Inngest active-functions list = exactly the 7 in `serve.ts` (`employeeLifecycleFn`, `interactionHandlerFn`, `ruleExtractorFn`, `ruleSynthesizerFn`, `reviewingWatchdogFn`, `slackTriggerHandlerFn`, `slackInputCollectorFn`) ✓
- `go-models.ts` 14 models ✓ · 7 worker-tool service dirs ✓ · `opencode.json` `autoupdate:false` ✓ · OpenCode pin `1.14.31` in Dockerfile ✓
- Semantic constants present and correct: `SYNTHESIS_THRESHOLD=5`, `MAX_EMPLOYEE_RULES_CHARS=8000`, `MAX_EMPLOYEE_KNOWLEDGE_CHARS=32000`, ports `5432`/`6543`, 30-min watchdog, version pin `1.14.31` ✓

**DRIFT NOTE since prior plan**: AGENTS.md grew 763→**771 lines** / 11,613→**12,293 words**. `.opencode/skills/` is now **17** dirs (was 18). No task hardcodes the skill count, so this is informational only — the skills-index table (Task 5) must be built from a live `ls`, never a hardcoded number.

### Metis Review — Critical Traps Encoded as Guardrails

1. **SELF-DEMONSTRATING EXAMPLES**: § "Documentation Durability" contains volatile-fact _examples_ ("Active Functions (7)", "the 14-model Go list", "84 lines", "58 stories", "1490 passing, 27 skipped"). These teach what NOT to write — they MUST survive verbatim. Do NOT "fix" them.
2. **TWO AGENTS.md FILES**: target is ONLY repo-root `/Users/victordozal/repos/dozal-devs/ai-employee/AGENTS.md`. `src/workers/config/agents.md` (worker base config compiled by `agents-md-compiler.mts`) is a DIFFERENT file — HARD OUT.
3. **INTENTIONAL "looks-redundant-but-isn't" invariants** — preserve in meaning: World-A/World-B output-contract single-source; `knowledge_base/` snake_case exception; `postgrest-client.ts` raw `process.env` (do-not-"fix" note).
4. **SEMANTIC CONSTANTS (keep)**: see confirmed-accurate list above.
5. **Platform settings claim is wrong** — not all settings are required (`issues_slack_channel` + `cost_alert_slack_channel` are optional). Fix by naming the optional keys, NOT by writing a new count.

---

## Work Objectives

### Core Objective

Transform `AGENTS.md` into a lean, priority-ordered, 100%-accurate reference that preserves every critical invariant while removing all stale, wrong, volatile, and redundant content — and migrate heavy how-to into the appropriate skills.

### Concrete Deliverables

- Reorganized `AGENTS.md` with a navigation TOC, priority ordering, and a single skills-index table replacing the 10 stubs.
- All verified-wrong facts corrected; all volatile facts enumerated-not-counted; all dead sections removed.
- `src/workers/lib/` active files enumerated in Project Structure.
- Migrated content present in the relevant `SKILL.md` files (only where not already there).
- `README.md` stale facts corrected.
- Rule-preservation reconciliation artifact (the regression gate).

### Definition of Done

- [ ] `grep -nE '30 utilities|All 8 |8 (initial )?(platform )?settings' AGENTS.md` → no matches
- [ ] `grep -i 'haiku' AGENTS.md` → no matches (Haiku fully scrubbed — both line 26 and line 362)
- [ ] Platform-settings fix introduces NO new count: `grep -nE '9 (settings|platform settings)|7 (are )?required' AGENTS.md` → no matches (optional keys named instead)
- [ ] `guest-message-poll` does not appear as an active trigger in AGENTS.md
- [ ] `grep -n 'and 11 others' AGENTS.md` → no matches
- [ ] Every `skill-name` referenced in AGENTS.md resolves to an existing `SKILL.md`
- [ ] Every `docs/*.md` and `.sisyphus/*.md` path referenced exists on disk (or is a documented prune)
- [ ] `grep -F 'Active Functions (7)' AGENTS.md` AND `grep -F 'the 14-model Go list' AGENTS.md` still match (self-demo examples survive)
- [ ] Rule-preservation reconciliation shows zero unaccounted removals
- [ ] Markdown lint/render passes (tables intact, exit 0)

### Must Have

- Every pre-edit MANDATORY/CRITICAL/NEVER/MUST/FORBIDDEN rule is preserved, intentionally moved-to-skill (skill named), or intentionally removed-as-dead (reason given).
- All semantic constants survive verbatim.
- All confirmed-accurate facts preserved.

### Must NOT Have (Guardrails)

- NO edits to `src/workers/config/agents.md` (the worker base config).
- NO edits to `~/.config/opencode/AGENTS.md` (user-level config) — HARD OUT.
- NO edits to any source/DB/seed file (`.ts`, `.json`, `.prisma`) — markdown-only. Fix docs to match code, NEVER code to match docs.
- NO "fixing" the OpenCode-pin / `opencode.json` text — re-verification proved it is correct.
- NO "fixing" the self-demonstrating examples inside § Documentation Durability.
- NO deletion of intentional cross-world duplication or semantic constants.
- NO invented new conventions/rules — the only net-new content permitted is the navigation TOC and the skills-index table.
- NO silent deletion of a MANDATORY procedure (e.g., the backup script) — relocate to a destination that documents it before removing from AGENTS.md.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed via `grep`/`diff`/`wc`/markdown-lint. This is a documentation task; Playwright/curl/tmux do not apply. Every criterion is a command with binary pass/fail.

### Test Decision

- **Infrastructure exists**: N/A (documentation task)
- **Automated tests**: NONE
- **Framework**: none
- **Primary verification**: command-based content assertions (grep/diff/wc) + markdown lint + rule-preservation reconciliation diff against the committed baseline.

### QA Policy

Every task includes agent-executed QA scenarios using **Bash (grep/diff/wc/git)**. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.txt`.

---

## Execution Strategy

### Sequential Execution (with limited overlap)

```
Wave 1 (Baseline — MUST run first, blocks all edits):
└── Task 1: Commit pre-edit baseline + extract Critical-Rule Inventory

Wave 2 (Read-only prep — can overlap, no AGENTS.md writes):
├── Task 2: Skill-content gap audit for migration targets (read-only)
└── Task 3: Reference-Documents path + status audit (read-only)

Wave 3 (AGENTS.md edits — SERIALIZED, one editor at a time):
└── Task 4: Fix all verified-wrong facts in AGENTS.md
└── Task 5: Remove dead content (Deprecated Components + 10 stubs + skills-index table)
└── Task 6: Fix volatile facts + add missing workers/lib files + dedup + Reference table
└── Task 7: Full priority restructure + TOC + relocate backup script

Wave 4 (Sibling-file edits — can overlap once AGENTS.md stabilizes):
├── Task 8: Migrate heavy how-to into SKILL.md files (only where missing)
└── Task 9: Fact-fix README.md

Wave 5 (Verification — after all edits):
└── Task 10: Run all command-based acceptance gates + rule-preservation reconciliation

Wave FINAL (Reviews + notify):
├── F1: Information-preservation audit (oracle)
├── F2: Doc accuracy + markdown quality review (unspecified-high)
└── F3: Scope fidelity check (deep)
-> Present results -> user okay
└── Task 11: Notify completion (Telegram)

Critical Path: Task 1 → Task 4 → Task 5 → Task 6 → Task 7 → Task 10 → F1-F3 → user okay → Task 11
```

> **Why mostly sequential**: Tasks 4-7 all edit `AGENTS.md`. Parallel edits would clobber each other. Split by concern for reviewability and safe incremental commits, executed one at a time. Tasks 2-3 (read-only) and 8-9 (sibling files) are the only safe overlaps.

### Dependency Matrix

| Task | Depends On        | Blocks         |
| ---- | ----------------- | -------------- |
| 1    | —                 | 4, 5, 6, 7, 10 |
| 2    | 1                 | 8              |
| 3    | 1                 | 6, 7           |
| 4    | 1                 | 5              |
| 5    | 4                 | 6              |
| 6    | 5, 3              | 7              |
| 7    | 6                 | 8, 9, 10       |
| 8    | 2, 7              | 10             |
| 9    | 7                 | 10             |
| 10   | 7, 8, 9           | F1-F3          |
| 11   | F1-F3 + user okay | —              |

### Agent Dispatch Summary

| Task | Category         | Skills        |
| ---- | ---------------- | ------------- |
| 1    | quick            | —             |
| 2    | unspecified-low  | —             |
| 3    | quick            | —             |
| 4    | unspecified-high | —             |
| 5    | unspecified-high | —             |
| 6    | unspecified-high | —             |
| 7    | writing          | —             |
| 8    | writing          | skill-creator |
| 9    | writing          | —             |
| 10   | quick            | —             |
| F1   | oracle           | —             |
| F2   | unspecified-high | —             |
| F3   | deep             | —             |
| 11   | quick            | —             |

---

## TODOs

- [x] 1. Baseline: commit pre-edit state + extract Critical-Rule Inventory

  **What to do**:
  - Ensure `AGENTS.md` is committed at its current (pre-edit) state so `git show HEAD:AGENTS.md` is a clean diff baseline. If there are uncommitted changes to AGENTS.md, commit them first with `docs(agents): snapshot before cleanup`. Record the baseline commit SHA in the evidence file (later tasks diff against it).
  - Extract the Critical-Rule Inventory: `grep -nE 'MANDATORY|CRITICAL|NEVER|MUST NOT|MUST |FORBIDDEN|do NOT|⚠️' AGENTS.md > .sisyphus/evidence/critical-rule-inventory.txt`. This is the regression baseline used by Task 10 and F1.
  - Capture baseline metrics: `wc -l AGENTS.md && wc -w AGENTS.md > .sisyphus/evidence/task-1-baseline-size.txt` (expected ~771 lines / ~12,293 words at time of writing).

  **Must NOT do**:
  - Do NOT edit AGENTS.md content in this task — baseline only.

  **Recommended Agent Profile**:
  - **Category**: `quick` — mechanical git + grep capture, no judgment.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — must complete first.
  - **Blocks**: 4, 5, 6, 7, 10.
  - **Blocked By**: None.

  **References**:
  - `AGENTS.md` — target (repo root, absolute path `/Users/victordozal/repos/dozal-devs/ai-employee/AGENTS.md`).
  - `AGENTS.md` § "Documentation Durability" — defines the semantic-constants keep-list and volatile-fact forbidden-list governing this cleanup.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Baseline committed and inventory captured
    Tool: Bash (git + grep)
    Steps:
      1. Run: git show HEAD:AGENTS.md | head -1   → returns file header (clean baseline exists)
      2. Run: test -s .sisyphus/evidence/critical-rule-inventory.txt && echo OK
      3. Run: wc -l .sisyphus/evidence/critical-rule-inventory.txt  → non-zero
    Expected Result: baseline retrievable from git; inventory non-empty; baseline SHA recorded
    Evidence: .sisyphus/evidence/task-1-baseline-size.txt, .sisyphus/evidence/critical-rule-inventory.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): snapshot before cleanup` (only if uncommitted changes exist)
  - Files: `AGENTS.md`

- [x] 2. Skill-content gap audit for migration targets (read-only)

  **What to do**:
  - For each of the 10 `[Moved to skill]` stubs, READ the referenced `SKILL.md` and confirm the content the stub points to ACTUALLY exists there: `slack-conventions`, `api-design`, `production-ops`, `long-running-commands`, `debugging-lifecycle`, `feature-verification`.
  - For the heavier content slated for migration in Task 8 (RBAC role/permission tables → `security`; Database backup shell script → `production-ops` or a new guide; dashboard-only conventions like SearchableSelect/card-shells/URL-state → `react-dashboard`), check whether the destination skill already documents it.
  - Produce a gap report: for each migration item → {already-present-in-skill | missing-must-add-in-task-8}. Save to `.sisyphus/evidence/task-2-skill-gap-report.md`.

  **Must NOT do**:
  - Do NOT edit any file — read-only audit.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low` — read + classify, low effort.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — read-only, overlaps with Task 3.
  - **Blocks**: 8.
  - **Blocked By**: 1.

  **References**:
  - `.opencode/skills/slack-conventions/SKILL.md`, `.opencode/skills/api-design/SKILL.md`, `.opencode/skills/production-ops/SKILL.md`, `.opencode/skills/debugging-lifecycle/SKILL.md`, `.opencode/skills/feature-verification/SKILL.md`, `.opencode/skills/security/SKILL.md`, `.opencode/skills/react-dashboard/SKILL.md` — migration destinations (all confirmed present in `.opencode/skills/`).
  - `AGENTS.md` § "Authentication & Authorization" (RBAC tables), § "Database" (backup script), § "Key Conventions" (dashboard rules) — source content to check for.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Gap report produced with a verdict per migration item
    Tool: Bash (grep)
    Steps:
      1. Run: test -s .sisyphus/evidence/task-2-skill-gap-report.md && echo OK
      2. Confirm report lists each of the 10 stub topics + each Task-8 migration item with a present/missing verdict
    Expected Result: report exists and covers every migration target
    Evidence: .sisyphus/evidence/task-2-skill-gap-report.md
  ```

  **Commit**: NO (read-only artifact; may be committed with Task 8)

- [x] 3. Reference-Documents path + status audit (read-only)

  **What to do**:
  - For every row in the AGENTS.md "Reference Documents" table, confirm the referenced path exists on disk (`test -f`). List any broken paths.
  - Determine status of plan-pointer rows (e.g. `worker-agent-delegation-redesign.md` — confirmed EXISTS but labeled "Active (14 tasks across 4 waves)"; also check `2026-06-01-2344-platform-settings-table.md` and any maintainability/conversational-editing plan rows): classify each as {completed/superseded → prune | evergreen → keep}. Use the plan file contents (final-state checkboxes, dates) to decide.
  - Save the keep/prune/fix-label decision list to `.sisyphus/evidence/task-3-reference-docs-audit.md`. Feeds Task 6.

  **Must NOT do**:
  - Do NOT edit AGENTS.md or any doc — read-only.

  **Recommended Agent Profile**:
  - **Category**: `quick` — file-existence checks + status classification.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — read-only, overlaps with Task 2.
  - **Blocks**: 6.
  - **Blocked By**: 1.

  **References**:
  - `AGENTS.md` § "Reference Documents" — the table to audit.
  - `.sisyphus/plans/` — directory of plan files to check status.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Every Reference row classified and paths verified
    Tool: Bash (test -f loop)
    Steps:
      1. Run: test -s .sisyphus/evidence/task-3-reference-docs-audit.md && echo OK
      2. Confirm each table row has {path exists Y/N} + {keep | prune | fix-label}
    Expected Result: complete audit covering every Reference Documents row
    Evidence: .sisyphus/evidence/task-3-reference-docs-audit.md
  ```

  **Commit**: NO (read-only artifact)

- [x] 4. Fix all verified-wrong facts in AGENTS.md

  **What to do** (apply each exact correction against live source as source of truth):
  - **Platform settings** (§ Database, ~line 364) — **fix WITHOUT introducing any count** (per § Documentation Durability): delete the stale "All 8 initial settings have `is_required = true`" clause. Do NOT replace it with "9 settings" or "7 required" — those are equally volatile. State the durable, named property instead: e.g. "Most settings are required; `issues_slack_channel` and `cost_alert_slack_channel` are optional (`is_required = false`)." Keep the enumerated key list as the source of truth. Verify the two optional keys against `prisma/seed.ts`.
  - **Haiku — scrub BOTH references (Haiku is retired per policy)**:
    - **Line 26**: DELETE the entire "Permitted Anthropic model (verification/judge only): `anthropic/claude-haiku-4-5` ..." sentence. No Anthropic model is presented as a permitted gateway model. Default remains `deepseek/deepseek-v4-flash`.
    - **Line 362**: remove "Haiku-generated"; replace with "generated via the configured gateway LLM model (`gateway_llm_model`, default `deepseek/deepseek-v4-flash`)". Verify against `src/gateway/services/time-estimator.ts`.
    - After this task, `grep -i haiku AGENTS.md` MUST return zero matches.
  - **Inngest functions** (§ Project Structure, ~line 467, `inngest/triggers/`): mark `guest-message-poll` as deregistered (exists on disk but NOT in `src/gateway/inngest/serve.ts`), matching how `daily-summarizer` is already noted. Do NOT alter the confirmed-accurate active-function list.

  **Must NOT do**:
  - **Do NOT introduce any new count** when fixing platform settings (no "9", no "7") — name the optional keys instead.
  - Do NOT touch confirmed-accurate facts (model catalog list, active-function list, ports, cron, version pin).
  - **Do NOT alter the OpenCode-pin / `opencode.json` text** — re-verification proved it is correct (`autoupdate:false` IS in opencode.json; pin is in Dockerfile; AGENTS.md makes no false location claim).
  - Do NOT alter self-demonstrating examples in § Documentation Durability.
  - Do NOT edit any `.ts`/`.json`/`.prisma` — fix the DOC to match code.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — surgical fact-fixing requiring cross-reference to live source.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — edits AGENTS.md (serialized).
  - **Blocks**: 5.
  - **Blocked By**: 1.

  **References**:
  - `prisma/seed.ts` — platform_settings seed block: `issues_slack_channel` and `cost_alert_slack_channel` are `is_required:false`; the rest are `is_required:true` (name the optional keys, do not count).
  - `src/gateway/services/time-estimator.ts` — `callLLM({taskType:'review'})` → `gateway_llm_model`, not Haiku.
  - `src/gateway/inngest/serve.ts` — the 7 registered functions (no guest-message-poll).
  - `src/workers/config/opencode.json` — `autoupdate:false` present, NO version field (do not flag as wrong).
  - `AGENTS.md` § Database, § Project Structure — edit locations.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: All verified-wrong strings eliminated, zero Haiku, zero new counts
    Tool: Bash (grep)
    Steps:
      1. Run: grep -nE 'All 8 |8 (initial )?(platform )?settings' AGENTS.md   → empty
      2. Run: grep -i 'haiku' AGENTS.md                                       → empty (BOTH refs scrubbed)
      3. Confirm platform-settings text introduces NO count: grep -nE '9 (settings|platform settings)|7 (are )?required' AGENTS.md → empty; instead names issues_slack_channel + cost_alert_slack_channel as optional
      4. Confirm guest-message-poll line now says deregistered/not-registered
    Expected Result: corrections present; zero Haiku; zero new counts; no wrong strings remain
    Evidence: .sisyphus/evidence/task-4-fact-grep.txt

  Scenario: Confirmed-accurate facts + OpenCode-pin text untouched
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c 'minimax/minimax-m2.7' AGENTS.md  → still present
      2. Run: grep -n '1.14.31' AGENTS.md → unchanged (pin + durability example both intact)
      3. Confirm active-function list unchanged; ports 5432/6543 present
    Expected Result: accurate facts and pin text intact
    Evidence: .sisyphus/evidence/task-4-accurate-intact.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): fix platform-settings count, time-estimator model, and inngest trigger facts`
  - Files: `AGENTS.md`
  - Pre-commit: markdown lint

- [x] 5. Remove dead content + replace 10 stubs with one skills-index table

  **What to do**:
  - Remove the entire **Deprecated Components** section/table (~line 30; all 7 referenced files verified deleted from disk). Replace with at most a one-line historical note: "The engineering employee and its orchestrator-based worker are retired; all active employees use the OpenCode harness."
  - Delete the 10 dead `[Moved to skill]` stub H2 sections (4 Slack stubs at ~205/209/213/217, Admin API ~301, Render API ~423, Long-Running Commands ~599 + Tmux sub-stub ~603, Known Issues ~607, Task Debugging ~611, Feature Verification Checklist ~638). Locate by heading text (line numbers shift after Task 4).
  - Add ONE compact "Detailed topics → load this skill" index table capturing the topic→skill mapping (slack-conventions, api-design, production-ops, long-running-commands, debugging-lifecycle, feature-verification). Confirmed in Task 2 the content already lives in those skills — do NOT re-add prose here.
  - Build the index from a live check that each referenced skill exists; do NOT hardcode a skill count.

  **Must NOT do**:
  - Do NOT delete a stub whose content Task 2 flagged as MISSING from its skill — flag it for Task 8 instead.
  - Do NOT remove the live Skills System dispatch table (that is not a stub).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — deletion with preservation judgment.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — edits AGENTS.md (serialized).
  - **Blocks**: 6.
  - **Blocked By**: 4.

  **References**:
  - `.sisyphus/evidence/task-2-skill-gap-report.md` — confirms which stub content is safe to drop.
  - `AGENTS.md` headings for Deprecated Components and the 10 stubs.
  - `AGENTS.md` § "Skills System" — the live dispatch table (do NOT remove).

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Dead sections gone, index table present
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c '\[Moved to skill' AGENTS.md   → 0
      2. Run: grep -c '## Deprecated Components' AGENTS.md → 0
      3. Confirm a single "Detailed topics" / skills-index table exists
    Expected Result: 10 stubs + deprecated table removed; one index table added
    Evidence: .sisyphus/evidence/task-5-stubs-removed.txt

  Scenario: Every skill in the index resolves
    Tool: Bash (ls/test)
    Steps:
      1. For each skill name in the new index, test the SKILL.md exists under .opencode/skills/ or src/workers/skills/
    Expected Result: dangling-reference count = 0
    Evidence: .sisyphus/evidence/task-5-index-resolves.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): remove deprecated table and dead skill-stub sections; add skills index`
  - Files: `AGENTS.md`
  - Pre-commit: markdown lint

- [x] 6. Fix volatile facts + add missing workers/lib files + dedup + Reference table

  **What to do**:
  - **Volatile facts** (per § Documentation Durability — enumerate, don't count):
    - Go models (~line 28): "and 11 others (see `src/lib/go-models.ts`)" → "and others (see `src/lib/go-models.ts` for the full list)".
    - "14 tasks across 4 waves" (~line 739, Reference Documents) → remove count (also handled by prune in this task).
  - **Add missing `workers/lib/` files** (§ Project Structure): enumerate the active files currently undocumented: `approval-card-poster.mts`, `env-manifest-builder.mts`, `failure-codes.ts`, `heartbeat.ts`, `model-provider.mts`, `opencode-server.ts`, `output-contract.mts`, `prompt-assembler.mts`, `resource-caps.ts`, `slack-notifier.mts`, `template-vars.ts`, `trigger-payload.mts`. Verify against `ls src/workers/lib/` at execution time. Describe by role; do NOT assert a count.
  - **Dedup**:
    - Slack @mention/channel routing is described in BOTH § OpenCode Worker (~line 102) and § Tenants. Keep the routing-algorithm detail in § OpenCode Worker; keep only the many-tenants-per-workspace nuance in § Tenants; remove the duplicate routing mechanics.
    - "Rebuild after every worker change" appears in BOTH § OpenCode Worker and § Infrastructure. Keep it in § Infrastructure; remove the duplicate from § OpenCode Worker.
  - **Reference Documents table** (per Task 3 audit): prune completed/superseded plan rows; fix remaining stale labels (remove "Active"/volatile counts). Keep every evergreen row; verify each kept path resolves.

  **Must NOT do**:
  - Do NOT remove semantic constants (5, 8000, 32000, 1.14.31, 30-min, ports).
  - Do NOT alter the self-demonstrating examples in § Documentation Durability.
  - Do NOT prune a Reference row Task 3 classified as evergreen.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — multi-point edit with durability-rule judgment.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — edits AGENTS.md (serialized).
  - **Blocks**: 7.
  - **Blocked By**: 5, 3.

  **References**:
  - `.sisyphus/evidence/task-3-reference-docs-audit.md` — prune/keep/fix-label decisions.
  - `src/lib/go-models.ts` — confirms the list is the source of truth (14 entries; no count needed).
  - `src/workers/lib/` — run `ls` to enumerate active files at execution time.
  - `AGENTS.md` § "Documentation Durability" — governing rule for enumerate-not-count.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Volatile counts removed, missing files added, dups gone
    Tool: Bash (grep)
    Steps:
      1. Run: grep -nE 'and 11 others|14 tasks across 4 waves|30 utilities' AGENTS.md  → empty
      2. Confirm at least 3 previously-missing workers/lib files now appear (e.g. opencode-server.ts, prompt-assembler.mts, heartbeat.ts)
      3. Confirm "rebuild after every worker change" appears exactly ONCE
      4. Confirm Slack routing mechanics appear in one section only
    Expected Result: volatile counts gone; missing files documented; duplicates collapsed
    Evidence: .sisyphus/evidence/task-6-volatile-dedup.txt

  Scenario: Reference table pruned and all kept paths resolve
    Tool: Bash (test -f loop)
    Steps:
      1. For each remaining Reference Documents path, test the file exists
      2. Confirm superseded plan rows removed per Task 3 audit
    Expected Result: missing-path count = 0; pruned rows gone
    Evidence: .sisyphus/evidence/task-6-reference-resolve.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): remove volatile counts, document workers/lib, dedup, prune reference table`
  - Files: `AGENTS.md`
  - Pre-commit: markdown lint

- [x] 7. Full priority restructure + navigation TOC + relocate backup script

  **What to do**:
  - **Reorder by priority** so the most-critical never-violate content comes first. Suggested grouping (preserve ALL content; reorder, not delete):
    1. **Critical constraints** (top): Approved LLM Models, multi-tenancy mandate, soft-delete-only, the must-never-violate Key Conventions (injection-exactly-two-things, shared-files-employee-agnostic, /tmp-tools-only, World-A/World-B, sendError/sendSuccess).
    2. **System overview**: Platform Vision + Current Implementation (merge into one tight paragraph), CURRENT-ARCHITECTURE pointer.
    3. **Building/operating employees**: Adding a New Employee, OpenCode Worker, Skills System, Feedback Pipeline, Tenants.
    4. **Platform mechanics**: Auth & Authorization, Database, Infrastructure, CI/CD, Commands, Dashboard URLs, Environment Variables, Project Structure.
    5. **Process/meta**: Documentation Freshness, Documentation Durability, Future Work, Prometheus Telegram rules, Feature Verification / E2E / Plan validation, Reference Documents.
  - **Add a navigation TOC** at the top (anchor links to the H2 sections) — the only net-new content besides the skills index.
  - **Relocate the Database backup shell script** (~28 lines) out of § Database into the `production-ops` skill (or a `docs/guides/` backup guide if Task 2 indicates a better home). Leave in AGENTS.md only the one-line MANDATORY mandate + pointer. Do NOT silently delete the procedure; it must exist at the destination first.
  - Tighten prose throughout WITHOUT removing any rule or invariant.

  **Must NOT do**:
  - Do NOT drop any MANDATORY/CRITICAL rule during reordering — every item in the Task 1 inventory must survive or be accounted for.
  - Do NOT alter self-demonstrating examples or semantic constants.
  - Do NOT invent new rules/conventions; TOC + skills-index are the only net-new additions.

  **Recommended Agent Profile**:
  - **Category**: `writing` — large-scale documentation restructuring + prose tightening.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — edits AGENTS.md (final AGENTS.md task).
  - **Blocks**: 8, 9, 10.
  - **Blocked By**: 6.

  **References**:
  - `.sisyphus/evidence/critical-rule-inventory.txt` — every rule that must survive the reorder.
  - `.sisyphus/evidence/task-2-skill-gap-report.md` — confirms backup-script destination readiness.
  - `AGENTS.md` (current post-Task-6 state) — content to reorder.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: TOC present, backup script relocated, all rules survive
    Tool: Bash (grep/diff)
    Steps:
      1. Confirm a TOC with anchor links exists at top of AGENTS.md
      2. Run: grep -c 'pg_dump' AGENTS.md → 0 (script moved out); confirm 1-line backup mandate + pointer remains
      3. Confirm the destination (production-ops skill or new guide) now contains the pg_dump script
      4. Diff Task-1 inventory keywords vs current: every critical rule still resolves (or documented in reconciliation)
    Expected Result: restructured, TOC added, backup relocated with zero rule loss
    Evidence: .sisyphus/evidence/task-7-restructure-check.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): restructure by priority, add TOC, relocate backup procedure`
  - Files: `AGENTS.md`, destination skill/guide for the backup script
  - Pre-commit: markdown lint

- [x] 8. Migrate heavy how-to into SKILL.md files (only where missing)

  **What to do**:
  - Using the Task 2 gap report, for each migration item flagged MISSING from its destination skill, ADD the trimmed content into the appropriate `SKILL.md`:
    - RBAC role/permission tables (if trimmed from AGENTS.md § Auth) → `.opencode/skills/security/SKILL.md`.
    - Database backup pg_dump/restore script (from Task 7) → `production-ops` skill (the relocation destination; coordinate with Task 7 — whichever runs the move owns the write, the other verifies).
    - Dashboard-only conventions if trimmed (SearchableSelect, card shells, URL-encoded state, end-user language) → `.opencode/skills/react-dashboard/SKILL.md`.
  - For items the gap report flagged ALREADY-PRESENT, do nothing (no duplication).
  - If Task 2 found everything already present, this task is verification-only.

  **Must NOT do**:
  - Do NOT duplicate content already in a skill.
  - Do NOT edit `src/workers/config/agents.md` or any worker-compiled config.
  - Do NOT remove anything from AGENTS.md here (that already happened in Tasks 5-7).

  **Recommended Agent Profile**:
  - **Category**: `writing` — documentation authoring into skills.
  - **Skills**: `skill-creator` — for correct SKILL.md frontmatter/structure conventions.

  **Parallelization**:
  - **Can Run In Parallel**: YES — edits sibling skill files, overlaps with Task 9 (different files).
  - **Blocks**: 10.
  - **Blocked By**: 2, 7.

  **References**:
  - `.sisyphus/evidence/task-2-skill-gap-report.md` — the authoritative gap list.
  - `.opencode/skills/security/SKILL.md`, `.opencode/skills/react-dashboard/SKILL.md`, `.opencode/skills/production-ops/SKILL.md` — destinations.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Every migrated item lives in exactly one place
    Tool: Bash (grep)
    Steps:
      1. For each gap-report MISSING item, grep the destination SKILL.md → now present
      2. Confirm no content duplicated (item not in BOTH AGENTS.md and skill unless an intentional invariant summary + pointer)
    Expected Result: all gaps filled; zero duplication
    Evidence: .sisyphus/evidence/task-8-migration-check.txt
  ```

  **Commit**: YES
  - Message: `docs(skills): receive content migrated out of AGENTS.md`
  - Files: affected `SKILL.md` files
  - Pre-commit: markdown lint

- [x] 9. Fact-fix README.md

  **What to do**:
  - Audit `README.md` for the same stale facts found in AGENTS.md and correct them against live source (same sources as Task 4): any deprecated-orchestrator framing, stale employee table entries, env-var notes that contradict the corrected AGENTS.md, and any volatile counts.
  - Known specific item: README line ~261 says "58 stories across 5 releases" for the Phase 1 Story Map — this is a volatile count; verify against the story-map doc and either remove the count or confirm. (Note: the identical "58 stories" string is a protected _example_ inside AGENTS.md's Durability section — that one must NOT change; this is the README's own live claim, which is fair game.)
  - Keep README's own audience and structure — correct FACTS only; do not restructure or unify with AGENTS.md.

  **Must NOT do**:
  - Do NOT restructure README or copy AGENTS.md content into it.
  - Do NOT edit code to match README — fix the doc.

  **Recommended Agent Profile**:
  - **Category**: `writing` — prose fact-correction.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — edits README.md only, overlaps with Task 8.
  - **Blocks**: 10.
  - **Blocked By**: 7.

  **References**:
  - `README.md` — target.
  - `prisma/seed.ts`, `src/gateway/inngest/serve.ts`, `src/gateway/services/time-estimator.ts`, `docs/planning/2026-04-21-2202-phase1-story-map.md` — live sources for fact verification.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: README stale facts corrected
    Tool: Bash (grep)
    Steps:
      1. Run: grep -inE 'haiku-generated|All 8 settings|30 utilities' README.md → empty
      2. Confirm deprecated-orchestrator framing and employee table match reality; story count verified
    Expected Result: README facts align with live code; no contradictions with corrected AGENTS.md
    Evidence: .sisyphus/evidence/task-9-readme-check.txt
  ```

  **Commit**: YES
  - Message: `docs(readme): correct stale facts`
  - Files: `README.md`
  - Pre-commit: markdown lint

- [x] 10. Run all command-based acceptance gates + rule-preservation reconciliation

  **What to do**:
  - Produce the **rule-preservation reconciliation**: diff the Task-1 inventory against the final AGENTS.md. For every pre-edit critical rule, classify as {kept | moved-to-skill:`<name>` (verified present) | removed-as-dead:`<reason>`}. ZERO unaccounted removals. Save to `.sisyphus/evidence/task-10-reconciliation.md`.
  - Run the full negative-grep gate, skill-pointer resolution, internal-path resolution, self-demo-example survival, semantic-constant survival, and markdown lint. Capture all outputs.
  - Record before/after `wc -l` / `wc -w` delta (baseline ~771/12,293) as size-reduction evidence.

  **Must NOT do**:
  - Do NOT modify content here — verification only. If a gate fails, report it for a fix task; do not silently patch.

  **Recommended Agent Profile**:
  - **Category**: `quick` — running command gates + assembling reconciliation.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — final verification, needs all edits done.
  - **Blocks**: F1-F3.
  - **Blocked By**: 7, 8, 9.

  **References**:
  - `.sisyphus/evidence/critical-rule-inventory.txt` — the baseline.
  - All Definition-of-Done commands in this plan.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: All gates pass
    Tool: Bash (grep/diff/wc/markdownlint)
    Steps:
      1. grep -nE '30 utilities|All 8 |8 (initial )?(platform )?settings' AGENTS.md → empty
      2. grep -i 'haiku' AGENTS.md → empty (both refs scrubbed)
      3. grep -nE '9 (settings|platform settings)|7 (are )?required' AGENTS.md → empty (no new counts)
      4. grep -n 'and 11 others' AGENTS.md → empty
      5. grep -F 'Active Functions (7)' AGENTS.md → 1+ (self-demo survives)
      6. Every referenced skill name resolves; every docs/.sisyphus path resolves
      7. Semantic constants (5, 8000, 32000, 1.14.31, 5432, 6543) all present
      8. markdown lint exits 0
      9. reconciliation shows zero unaccounted removals
    Expected Result: all gates green; reconciliation clean
    Evidence: .sisyphus/evidence/task-10-reconciliation.md, .sisyphus/evidence/task-10-gates.txt

  Scenario: Size reduced (evidence, not a hard gate)
    Tool: Bash (wc)
    Steps:
      1. Compare git show <baseline>:AGENTS.md | wc -l vs wc -l AGENTS.md
    Expected Result: materially fewer lines/words; delta recorded
    Evidence: .sisyphus/evidence/task-10-size-delta.txt
  ```

  **Commit**: NO (verification artifacts only; may commit evidence if desired)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Do NOT auto-proceed. Never mark F1-F3 checked before user okay.

- [x] F1. **Information-Preservation Audit** — `oracle`
      Read the committed pre-edit `AGENTS.md` (`git show <baseline>:AGENTS.md`) and the current `AGENTS.md`. For EVERY rule containing MANDATORY/CRITICAL/NEVER/MUST/FORBIDDEN/⚠️ in the original, confirm it is present in the new file OR documented in the reconciliation artifact as moved-to-skill (skill verified to contain it) or removed-as-dead (reason valid). Confirm all semantic constants survive and the self-demonstrating examples are intact.
      Output: `Critical rules [N/N accounted] | Semantic constants [N/N present] | Self-demo examples [present] | VERDICT: APPROVE/REJECT`

- [x] F2. **Doc Accuracy + Markdown Quality Review** — `unspecified-high`
      Re-verify each fact fix against LIVE source (not the audit): `prisma/seed.ts` platform_settings (the optional keys are `issues_slack_channel` + `cost_alert_slack_channel`; confirm the fix names them rather than asserting a count), `src/gateway/inngest/serve.ts` (active functions, no guest-message-poll), `time-estimator.ts` (no Haiku), `src/workers/lib/` file list, `src/lib/go-models.ts`. Confirm `grep -i haiku AGENTS.md` is empty (both refs scrubbed) and no new count strings were introduced. Run markdown lint/render; confirm all tables parse. Run the negative-grep gate. Confirm all skill pointers and doc paths resolve. Confirm the OpenCode-pin text was NOT altered.
      Output: `Fact fixes [N/N verified] | Haiku [0 refs] | New counts [NONE] | Markdown [PASS/FAIL] | Pointers [N/N resolve] | VERDICT`

- [x] F3. **Scope Fidelity Check** — `deep`
      `git diff` the full change set. Confirm: only AGENTS.md, SKILL.md files, README.md, and (if relocated) a backup-guide doc were touched (zero `.ts`/`.json`/`.prisma`/worker-config/user-config edits). Confirm no new conventions/rules invented beyond TOC + skills-index. Confirm intentional cross-world duplication preserved. Flag any unaccounted change.
      Output: `Files touched [in-scope only] | New rules invented [NONE] | Cross-world invariants [preserved] | VERDICT`

-> Present F1-F3 results -> Get explicit user okay before completing.

- [ ] 11. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.
  - Run: `pnpm exec tsx scripts/telegram-notify.ts "✅ AGENTS.md cleanup complete — file restructured, all facts verified against live code, dead content removed, rules preserved. Come back to review results."`
  - Run ONLY after F1-F3 APPROVE and the user has given explicit okay.

---

## Commit Strategy

- One commit per AGENTS.md edit task (Tasks 4-7) for reviewable, revertable history.
- Task 1 commits the untouched baseline first.
- Tasks 8-9 commit separately (skills, README).
- Message style: `docs(agents): <what>`. No AI/tool attribution in messages.
- Pre-commit: markdown lint must pass; never `--no-verify`.

## Success Criteria

### Verification Commands

```bash
grep -nE '30 utilities|All 8 |8 (initial )?(platform )?settings' AGENTS.md   # Expected: empty
grep -i 'haiku' AGENTS.md                                                     # Expected: empty (both refs scrubbed)
grep -nE '9 (settings|platform settings)|7 (are )?required' AGENTS.md         # Expected: empty (no new counts)
grep -n 'and 11 others' AGENTS.md                                             # Expected: empty
grep -F 'Active Functions (7)' AGENTS.md                                      # Expected: 1+ match (self-demo survives)
wc -l AGENTS.md                                                               # Expected: materially fewer than 771
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All F1-F3 reviews APPROVE
- [ ] User has given explicit okay
