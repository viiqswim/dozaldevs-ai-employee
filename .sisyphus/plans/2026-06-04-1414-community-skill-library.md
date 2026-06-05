# Lean Skill Library + AGENTS.md Extraction — High-Signal Engineering Skills for AI Agent DX

## TL;DR

> **Quick Summary**: Create 9 new OpenCode dev skills and slim AGENTS.md by ~350 lines. The library is deliberately lean: 5 project-specific skills that encode genuinely non-obvious repo knowledge (Prisma+PostgREST, Inngest workflows, Express+Zod APIs, dashboard conventions, security/tenant isolation), plus 4 extraction skills that move bulky reference material out of the always-loaded AGENTS.md into on-demand skills. We deliberately do NOT create generic skills (TypeScript, Docker, Vitest, commit messages) that a strong model already knows or that collide with existing built-ins (`git-master`, `review-work`). A final measurement task validates whether the skills actually change agent behavior.
>
> **Deliverables**:
>
> - 9 new skill files under `.opencode/skills/<name>/SKILL.md`
> - AGENTS.md slimmed from ~819 lines to ~490 (extracted sections replaced with 1-line pointers)
> - "Task Debugging Quick Reference" merged into existing `debugging-lifecycle` skill
> - "Admin API" endpoint table absorbed into `api-design` skill
> - Hardcoded Render API key removed (replaced with `$RENDER_API_KEY` env reference)
> - A written before/after eval proving (or disproving) each skill's value
> - Fixed stale model reference in existing `creating-archetypes/SKILL.md`
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves + final verification
> **Critical Path**: Tasks 1–9 (parallel) → Task 10 (AGENTS.md surgery) → Task 11 (eval) → Task 12 (notify) → F1–F4

---

## Context

### Original Request

Research and implement a curated library of OpenCode SKILL.md files to improve the developer experience for engineers using AI coding agents (OpenCode, Claude Code, Cursor) on the ai-employee platform repository.

### Interview Summary

**Key Discussions**:

- **Goal**: Both improve agent code quality AND reduce onboarding friction
- **Target**: Dev skills only (`.opencode/skills/`) — NOT AI employee runtime skills (employees compile a separate AGENTS.md from archetype fields; they never read the repo root manual). This work benefits developer-side coding agents only.
- **Source approach**: Hybrid — community for general practices, custom for project-specific
- **Initial domains**: All 8 selected, but see Critical Review below for why the set was narrowed.

### Critical Review (post-generation, smarter-model pass)

A second critical pass found the original 15-skill plan was mechanically sound but strategically over-scoped. Adopted corrections:

- **Cut 6 generic skills** (`typescript`, `docker`, `vitest`, `error-handling`, `git-commits`, `code-review`). Rationale: (1) a strong model already applies these well — a skill saying "don't use `any`" is noise, not signal; (2) broad triggers like "Use when writing TypeScript" match nearly every task, defeating on-demand loading; (3) `git-commits` and `code-review` collide with existing built-in `git-master` and `review-work` skills.
- **Non-obvious repo facts preserved, not lost**: the worth-keeping bits of the cut skills either fold into a kept skill (e.g. Inngest absorbs `NonRetriableError`, structured-log fields, the $50/day breaker) or already live in always-loaded AGENTS.md sections we are NOT extracting (worker container naming + `performance-1x` in "OpenCode Worker"; `ai_employee_test` guard + pre-existing failures in "Pre-existing Test Failures"/"Database"; Git prohibitions in "Git Rules"; multi-tenancy/soft-delete in "Key Conventions").
- **Upgraded agent tiers**: writing a _good_ project-specific skill is synthesis work (read several files, distill 50–400 high-signal lines), not a `quick` typo fix. Adaptation skills run on `deep`/`unspecified-high`. Only the mechanical extraction moves stay on `quick`.
- **Added a real measurement (Task 11)**: the original plan's only success metric was "20 files exist that pass greps" — gameable and meaningless. Task 11 produces a written before/after eval so we can actually answer "did this improve agent outcomes?"

### Research Findings

- Top community sources: VoltAgent/awesome-agent-skills (24K stars), PatrickJS/awesome-cursorrules (40K stars), wshobson/agents (34K stars), prisma/cursor-plugin (official)
- OpenCode SKILL.md format: YAML frontmatter (`name` + `description` required), directory-based, on-demand loaded
- No community source exists for Inngest durable workflow patterns — must be written from scratch
- AGENTS.md extraction analysis: 819 lines across 29 sections; ~351 lines (43%) are on-demand reference material. Strongest extraction candidates: Feature Verification Checklist (119 lines), Task Debugging Quick Reference (65 lines, already duplicates `debugging-lifecycle`), Long-Running Commands + Tmux (51 lines), Render API (42 lines), Admin API (44 lines), Slack sections (39 lines)

### Metis Review

**Identified Gaps** (all addressed):

- Community source URLs may 404 — explicit fallback instructions per task
- Skills could contradict AGENTS.md conventions — cross-check step per task
- Stale model reference in `creating-archetypes/SKILL.md` — fixed in Task 10
- Section header convention — resolved: frontmatter-only (matching existing 5 skills)
- Render API key is a hardcoded secret — removed during extraction (Task 7)

---

## Work Objectives

### Core Objective

Create 9 high-signal on-demand skills and slim AGENTS.md by ~350 lines — reducing token cost on every developer-agent call while encoding the non-obvious, project-specific knowledge that a capable model would otherwise get wrong. Validate the result with a real before/after eval.

### Concrete Deliverables

**Project-specific skills (5 — non-obvious repo knowledge):**

1. `.opencode/skills/prisma/SKILL.md` — Prisma + PostgREST safety (cache reload, soft delete, `ai_employee` DB) [deep]
2. `.opencode/skills/inngest/SKILL.md` — Inngest durable workflows, lifecycle states, error handling (custom, no community source) [deep]
3. `.opencode/skills/api-design/SKILL.md` — Express + Zod routes, `UUID_REGEX` quirk, absorbs the full Admin API table [unspecified-high]
4. `.opencode/skills/react-dashboard/SKILL.md` — 3 mandatory dashboard conventions (SearchableSelect, URL state, card shells) [unspecified-high]
5. `.opencode/skills/security/SKILL.md` — encryption pattern, tenant isolation, secret handling [unspecified-high]

**Extraction skills (4 — content moved verbatim from AGENTS.md):**

6. `.opencode/skills/feature-verification/SKILL.md` — Feature Verification Checklist (~119 lines) [quick]
7. `.opencode/skills/production-ops/SKILL.md` — Render API + production debugging, API key removed (~42 lines) [quick]
8. `.opencode/skills/slack-conventions/SKILL.md` — Slack standards, hygiene, Socket Mode (~39 lines) [quick]
9. `.opencode/skills/long-running-commands/SKILL.md` — Tmux sessions, cleanup rules (~51 lines) [quick]

**Integration + validation:**

10. Updated `AGENTS.md` — extracted sections replaced with 1-line pointers, "Task Debugging Quick Reference" merged into `debugging-lifecycle`, Skills System tables updated with all 9 new triggers, stale model reference in `creating-archetypes` fixed
11. `.sisyphus/evidence/skill-usefulness-eval.md` — written before/after eval of whether each skill changes agent behavior
12. Telegram completion notification

**Explicitly NOT building** (and why): `typescript`, `docker`, `vitest`, `error-handling` (a strong model already handles these; non-obvious repo bits folded into kept skills or already in always-loaded AGENTS.md); `git-commits`, `code-review` (collide with built-in `git-master` / `review-work`).

### Definition of Done

- [ ] `ls .opencode/skills/ | wc -l` returns 14 (5 existing + 9 new)
- [ ] `wc -l .opencode/skills/*/SKILL.md` shows every new file ≥50 and ≤400 lines
- [ ] `grep -rn "claude-sonnet\|gpt-4o\|claude-opus\|claude-haiku" .opencode/skills/` returns zero matches
- [ ] `grep -rn "rnd_0XF5" .opencode/skills/` returns zero matches (no hardcoded API key)
- [ ] Each new SKILL.md has valid YAML frontmatter with `name` matching directory name and `description` starting with "Use when"
- [ ] AGENTS.md Skills System table has 14 dev skill entries (5 existing + 9 new)
- [ ] `wc -l AGENTS.md` returns ≤530 lines (down from ~819; target ~490)
- [ ] Extracted AGENTS.md sections replaced with 1-line skill pointers (not deleted outright)
- [ ] "Task Debugging Quick Reference" merged into `debugging-lifecycle/SKILL.md`
- [ ] "Admin API" table absorbed into `api-design/SKILL.md`
- [ ] `skill-usefulness-eval.md` exists with a concrete before/after verdict per skill
- [ ] Every skill references ≥1 real file path in this repo
- [ ] Every project-specific skill contains ≥3 concrete NEVER rules

### Must Have

- Each project-specific skill captures only what is non-obvious about THIS repo — not generic best practices a strong model already applies
- Inngest skill written from scratch with all 5 active function names; absorbs error-handling repo facts (`NonRetriableError`, structured-log fields `component`/`taskId`/`tenantId`/`step`, the $50/day cost breaker)
- Prisma skill includes PostgREST cache reload command (`NOTIFY pgrst, 'reload schema'`)
- Security skill references `src/lib/encryption.ts` and the tenant-secret isolation pattern
- React-dashboard skill encodes the 3 mandatory dashboard conventions (SearchableSelect, URL state, card shells)
- Extraction skills contain the FULL content from their AGENTS.md source sections (lossless MOVE, not summary)
- AGENTS.md extracted sections replaced with a pointer of the form: `**[Moved to skill]** — Load \`{skill-name}\` skill for full details.`
- "Admin API" table absorbed INTO `api-design/SKILL.md` (not a new skill); "Task Debugging Quick Reference" merged INTO `debugging-lifecycle/SKILL.md` (not a new skill)
- The measurement task (11) must produce an honest verdict — including "marginal" or "cut this" if a skill doesn't earn its keep

### Must NOT Have (Guardrails)

- No generic skills that restate what a capable model already does (no `typescript`, `docker`, `vitest`, `error-handling`)
- No skills that collide with built-ins (`git-commits` vs `git-master`; `code-review` vs `review-work`)
- No verbatim duplication of AGENTS.md content in project-specific skills (extraction skills are the exception — they MOVE content)
- No forbidden model names in any skill file (see AGENTS.md "Forbidden in hardcoded references")
- No `## When to Load This Skill` headers — YAML frontmatter `description` only (match existing convention)
- No skill exceeding 400 lines
- No removing an AGENTS.md section without leaving a 1-line skill pointer
- No hardcoded API keys in any skill file
- No rules contradicting AGENTS.md conventions (soft delete, multi-tenancy, `UUID_REGEX`, shared-file neutrality)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO — skill files are markdown, not testable code
- **Framework**: N/A
- **Validation instead**: structural greps per task (frontmatter, line count, forbidden patterns, required content) PLUS a written usefulness eval (Task 11) that judges signal, not just structure

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (All Parallel — write all 9 skills):
├── Task 1: Prisma + PostgREST skill [deep]
├── Task 2: Inngest workflow skill (custom) [deep]
├── Task 3: API design + Admin API absorption [unspecified-high]
├── Task 4: React dashboard conventions [unspecified-high]
├── Task 5: Security guardrails skill [unspecified-high]
├── Task 6: Feature verification skill (extract) [quick]
├── Task 7: Production ops skill (extract, strip API key) [quick]
├── Task 8: Slack conventions skill (extract) [quick]
└── Task 9: Long-running commands skill (extract) [quick]

Wave 2 (After Wave 1 — AGENTS.md surgery):
└── Task 10: AGENTS.md surgery + merges + stale-model fix [deep]

Wave 3 (After Wave 2 — validate + notify):
├── Task 11: Skill usefulness eval (before/after) [unspecified-high]
└── Task 12: Send Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Tasks 1–9 (parallel) → Task 10 → Task 11 → Task 12 → F1–F4 → user okay
Max Concurrent: 9 (Wave 1)
```

### Dependency Matrix

| Task  | Depends On | Blocks    |
| ----- | ---------- | --------- |
| 1–9   | None       | 10        |
| 10    | 1–9        | 11        |
| 11    | 10         | 12        |
| 12    | 11         | F1–F4     |
| F1–F4 | 12         | user okay |

### Agent Dispatch Summary

- **Wave 1**: **9** — T1, T2 → `deep`; T3, T4, T5 → `unspecified-high`; T6–T9 → `quick`
- **Wave 2**: **1** — T10 → `deep`
- **Wave 3**: **2** — T11 → `unspecified-high`; T12 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Prisma + PostgREST Skill

  **What to do**:
  - Read the actual repo first: `prisma/schema.prisma` (soft-delete columns, model shape), `prisma/seed.ts` (upsert/idempotent pattern), `src/workers/lib/postgrest-client.ts` (how workers talk to the DB)
  - Optionally consult `prisma/cursor-plugin` (official `schema-conventions.mdc` + `migration-best-practices.mdc`) for phrasing; if the URL 404s, proceed using repo patterns + the rules below
  - Create `.opencode/skills/prisma/SKILL.md`. Frontmatter: `name: prisma`, `description: "Use when changing the Prisma schema, writing migrations, editing seed data, or querying via PostgREST. Covers the schema-cache reload requirement, soft-delete enforcement, the ai_employee database name, and PostgREST-vs-psql verification."`
  - Focus on what is NON-OBVIOUS about this repo (skip generic Prisma advice a strong model already knows): the PostgREST schema cache must be reloaded after every migration that adds a table (`NOTIFY pgrst, 'reload schema'`) or workers see PGRST205; the app DB is `ai_employee` NOT `postgres` (the CLI default); soft delete only — never `.delete()`/`.deleteMany()`, use `.update({ deleted_at })`; seed must be idempotent (upsert); after a migration, verify the table is visible via a PostgREST curl to `localhost:54331`, not just psql
  - Cross-check: nothing here may contradict AGENTS.md "Key Conventions" (soft delete, multi-tenancy)

  **Must NOT do**:
  - Restate generic Prisma tutorial content (relations, basic CRUD) — assume the model knows it
  - Duplicate AGENTS.md soft-delete wording verbatim — state the repo-specific rule and reference it
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must read multiple repo files and distill the non-obvious PostgREST/migration coupling into high-signal rules — not a `quick` task
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2–9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma` — current schema, soft-delete columns
  - `prisma/seed.ts` — idempotent upsert seed pattern
  - `src/workers/lib/postgrest-client.ts` — worker→DB PostgREST client
  - `.opencode/skills/adding-shell-tools/SKILL.md` — canonical SKILL.md format
  - AGENTS.md § "Feature Verification Checklist" — PostgREST ≠ psql distinction (source of the cache-reload rule)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Prisma skill is valid and PostgREST-aware
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/prisma/SKILL.md
      2. Run: grep "NOTIFY pgrst" .opencode/skills/prisma/SKILL.md
      3. Run: grep -c "schema.prisma\|seed.ts\|postgrest-client" .opencode/skills/prisma/SKILL.md
      4. Run: grep -i "ai_employee" .opencode/skills/prisma/SKILL.md
      5. Run: wc -l .opencode/skills/prisma/SKILL.md
    Expected Result: Valid frontmatter (---, name: prisma, description: "Use when), NOTIFY pgrst present, ≥2 repo file refs, ai_employee DB named, 50–400 lines
    Evidence: .sisyphus/evidence/task-1-prisma-content.txt

  Scenario: Soft-delete and migration-safety NEVER rules present
    Tool: Bash
    Steps:
      1. Run: grep -i "deleteMany\|\.delete()" .opencode/skills/prisma/SKILL.md
      2. Run: grep -ci "never\|must not\|do not" .opencode/skills/prisma/SKILL.md
    Expected Result: ".delete()"/"deleteMany" appear in a NEVER context, ≥3 prohibition rules
    Evidence: .sisyphus/evidence/task-1-prisma-safety.txt
  ```

  **Commit**: YES (groups with Tasks 2–5)
  - Message: `feat(skills): add 5 project-specific engineering skills`
  - Files: `.opencode/skills/prisma/SKILL.md`

- [ ] 2. Inngest Durable Workflow Skill (Custom — No Community Source)

  **What to do**:
  - **No community source exists.** Write from scratch using this repo's patterns.
  - Read: `src/inngest/employee-lifecycle.ts` (main lifecycle), `src/inngest/lib/create-task-and-dispatch.ts`, `src/inngest/lib/`, `src/gateway/inngest/` (registration), `src/lib/call-llm.ts` (cost breaker)
  - Create `.opencode/skills/inngest/SKILL.md`. Frontmatter: `name: inngest`, `description: "Use when writing or modifying Inngest functions, step functions, event handlers, or durable workflow logic. Covers the 5 active functions, the full employee lifecycle state machine, NonRetriableError usage, step naming, event names, idempotency, and structured logging fields."`
  - Include: the 5 active function names (`employee/universal-lifecycle`, `employee/interaction-handler`, `employee/rule-extractor`, `employee/rule-synthesizer`, `trigger/reviewing-watchdog`); the 11 lifecycle states (Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done) + terminals (Failed, Cancelled); `NonRetriableError` for permanent failures (don't retry); `step.run()` kebab-case naming; `step.waitForEvent()` / `step.sleep()`; event names (`employee/task.dispatched`, `employee/approval.received`); idempotency (steps must be re-execution-safe); never nest steps; functions register in the gateway process (not a separate service)
  - **Absorb the worth-keeping error-handling repo facts** (from the cut `error-handling` skill): structured-log fields `component`/`taskId`/`tenantId`/`step`; never swallow errors silently in steps; the $50/day cost circuit breaker in `call-llm.ts`

  **Must NOT do**:
  - Reference deprecated files (`src/inngest/lifecycle.ts`, `redispatch.ts`, `orchestrate.mts`, `generic-harness`) — see AGENTS.md Deprecated Components
  - Include generic Inngest marketing/tutorial content
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Net-new synthesis from multiple source files; the highest-value skill in the set — must be accurate, not keyword-stuffed
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3–9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `src/inngest/employee-lifecycle.ts` — main lifecycle (states, steps, error handling)
  - `src/inngest/lib/create-task-and-dispatch.ts` — task creation/dispatch
  - `src/gateway/inngest/` — function registration
  - `src/lib/call-llm.ts` — $50/day cost circuit breaker
  - AGENTS.md § "OpenCode Worker" — lifecycle states, function names, terminals

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Inngest skill has all 5 functions, lifecycle states, error facts
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/inngest/SKILL.md
      2. Run: grep -c "universal-lifecycle\|interaction-handler\|rule-extractor\|rule-synthesizer\|reviewing-watchdog" .opencode/skills/inngest/SKILL.md
      3. Run: grep -c "Received\|Triaging\|AwaitingInput\|Ready\|Executing\|Validating\|Submitting\|Reviewing\|Approved\|Delivering\|Done" .opencode/skills/inngest/SKILL.md
      4. Run: grep -c "NonRetriableError\|circuit.breaker\|call-llm" .opencode/skills/inngest/SKILL.md
      5. Run: wc -l .opencode/skills/inngest/SKILL.md
    Expected Result: Valid frontmatter, all 5 function names (count=5), ≥8 lifecycle states, NonRetriableError + cost breaker present, 50–400 lines
    Evidence: .sisyphus/evidence/task-2-inngest-content.txt

  Scenario: No deprecated component references
    Tool: Bash
    Steps:
      1. Run: grep -c "src/inngest/lifecycle.ts\|src/inngest/redispatch.ts\|src/workers/orchestrate.mts\|generic-harness" .opencode/skills/inngest/SKILL.md
    Expected Result: Count = 0
    Evidence: .sisyphus/evidence/task-2-inngest-no-deprecated.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3–5)

- [ ] 3. API Design (Express + Zod) Skill — Absorbs Admin API Table

  **What to do**:
  - Read: `src/gateway/routes/` (route structure), `src/gateway/validation/schemas.ts` (Zod + `UUID_REGEX`), `src/gateway/middleware/adminAuth.ts` (admin auth)
  - Optionally consult `RobinTail/express-zod-api` AGENTS.md for phrasing; if 404, proceed from repo patterns + rules below
  - Create `.opencode/skills/api-design/SKILL.md`. Frontmatter: `name: api-design`, `description: "Use when creating or modifying Express routes, API endpoints, request validation, or response shapes, OR when you need the admin API endpoint catalog. Covers Zod validation, tenant-scoped routes, the UUID_REGEX quirk, and the full admin endpoint table with curl examples."`
  - Focus on the NON-OBVIOUS repo rules: use the loose `UUID_REGEX` from `schemas.ts` for route-param UUIDs, NOT `z.string().uuid()` (Zod v4 rejects some valid UUIDs — this is a real bug source here); admin routes require `X-Admin-Key`; tenant-scoped path shape `/admin/tenants/:tenantId/...`; thin handlers delegate to services; workers reach the DB via PostgREST, not direct Prisma; status-code conventions (201 create, 202 async, 409 conflict)
  - **ABSORB from AGENTS.md**: paste the full "Admin API" endpoint table (every method/path/description) and the curl trigger example. This content is removed from AGENTS.md in Task 10; this skill becomes its new home.

  **Must NOT do**:
  - Recommend `z.string().uuid()` for route params (contradicts AGENTS.md — it's the bug we're guarding against)
  - Include GraphQL/gRPC patterns (REST-only repo)
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Must accurately transcribe the admin endpoint catalog AND distill the UUID_REGEX/tenant-scoping rules — accuracy-sensitive, beyond `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1–2, 4–9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `src/gateway/routes/` — route handler structure
  - `src/gateway/validation/schemas.ts` — Zod schemas, `UUID_REGEX`
  - `src/gateway/middleware/adminAuth.ts` — admin auth
  - AGENTS.md § "Admin API" — endpoint table to absorb
  - AGENTS.md § "Zod v4 UUID validation" — UUID_REGEX requirement

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: API skill enforces UUID_REGEX, tenant scoping, and absorbs admin table
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/api-design/SKILL.md
      2. Run: grep "UUID_REGEX" .opencode/skills/api-design/SKILL.md
      3. Run: grep -c "admin/tenants\|X-Admin-Key" .opencode/skills/api-design/SKILL.md
      4. Run: grep -c "POST\|GET\|PATCH\|DELETE" .opencode/skills/api-design/SKILL.md
      5. Run: grep "z.string().uuid()" .opencode/skills/api-design/SKILL.md | grep -iv "never\|avoid\|not\|don't"
      6. Run: wc -l .opencode/skills/api-design/SKILL.md
    Expected Result: Valid frontmatter, UUID_REGEX present, ≥3 admin/tenant refs, ≥5 HTTP-method rows (absorbed table), no unqualified z.string().uuid() recommendation, 50–400 lines
    Evidence: .sisyphus/evidence/task-3-api-design-content.txt
  ```

  **Commit**: YES (groups with Tasks 1–2, 4–5)

- [ ] 4. React Dashboard Conventions Skill

  **What to do**:
  - Read: `dashboard/src/components/ui/searchable-select.tsx` (the mandated dropdown), `dashboard/src/components/` (real component patterns)
  - Optionally consult `vercel-labs/agent-skills` react-best-practices for phrasing; if 404, proceed — this skill is 80%+ project-specific anyway
  - Create `.opencode/skills/react-dashboard/SKILL.md`. Frontmatter: `name: react-dashboard`, `description: "Use when modifying the dashboard UI under dashboard/src/. Covers the three mandatory conventions this repo enforces: SearchableSelect for all dropdowns, URL-encoded state for all navigation, and card shells for visual sections — plus the non-technical end-user language rule."`
  - Focus ENTIRELY on the repo's mandatory, non-obvious conventions (a strong model already knows generic React): MANDATORY `SearchableSelect` for every user-facing dropdown — never the Radix `<Select>`; all navigable UI state must be URL-encoded via `useSearchParams` (tabs, filters, selections must survive refresh and be shareable); card shells for section separation (`rounded-lg border bg-card` with `px-5 py-4`, or `CollapsibleSection`); end-user copy is non-technical ("Organization" not "Tenant", "Employee setup" not "Archetype configuration")
  - Reference the component file rather than re-documenting its full prop list

  **Must NOT do**:
  - Write a generic React tutorial — must be ≥80% repo-specific conventions
  - Re-document the full SearchableSelect prop API (reference the file)
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Must read dashboard components and capture the three mandatory conventions precisely with correct class strings — accuracy matters, beyond `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1–3, 5–9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `dashboard/src/components/ui/searchable-select.tsx` — the mandated dropdown
  - `dashboard/src/components/` — component patterns
  - AGENTS.md § "Key Conventions" — SearchableSelect, URL state, card shells, end-user language

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard skill encodes all 3 mandatory conventions
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/react-dashboard/SKILL.md
      2. Run: grep "SearchableSelect" .opencode/skills/react-dashboard/SKILL.md
      3. Run: grep "useSearchParams" .opencode/skills/react-dashboard/SKILL.md
      4. Run: grep "rounded-lg border bg-card" .opencode/skills/react-dashboard/SKILL.md
      5. Run: grep -i "non-technical\|Organization\|Employee setup" .opencode/skills/react-dashboard/SKILL.md
      6. Run: wc -l .opencode/skills/react-dashboard/SKILL.md
    Expected Result: Valid frontmatter, SearchableSelect + useSearchParams + card-shell class + end-user-language rule all present, 50–400 lines
    Evidence: .sisyphus/evidence/task-4-react-content.txt
  ```

  **Commit**: YES (groups with Tasks 1–3, 5)

- [ ] 5. Security Guardrails Skill

  **What to do**:
  - Read: `src/lib/encryption.ts` (AES-256-GCM pattern), `src/gateway/middleware/adminAuth.ts` (admin key auth), `src/gateway/validation/schemas.ts` (input validation)
  - Optionally consult `CloudDefenseAI/secure-agents-md` for baseline phrasing; if 404, proceed from rules below
  - Create `.opencode/skills/security/SKILL.md`. Frontmatter: `name: security`, `description: "Use when handling secrets, encryption, authentication, input validation, or tenant data isolation. Covers this repo's AES-256-GCM tenant-secret pattern, the multi-tenant isolation boundary, and the seed-only token rule."`
  - Focus on the repo-specific security boundaries (skip generic OWASP a model already knows): tenant secrets are stored encrypted via `src/lib/encryption.ts` (AES-256-GCM) in the `tenant_secrets` table — never in `.env`; `ENCRYPTION_KEY` must be 32-byte hex; tenant isolation is mandatory — every query scoped by `tenant_id`, no cross-tenant access; admin routes require `X-Admin-Key`; `VLRE_SLACK_BOT_TOKEN` is seed-only and must never be used at runtime by the gateway; no PII in log messages; never commit `.env`
  - Cross-check against AGENTS.md "Key Conventions" multi-tenancy mandate (reference, don't restate verbatim)

  **Must NOT do**:
  - Include generic network/firewall/infra security (out of scope)
  - Restate AGENTS.md multi-tenancy wording verbatim — reference it
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security content must be precise about the encryption pattern and tenant boundary — wrong details here are dangerous, beyond `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1–4, 6–9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `src/lib/encryption.ts` — AES-256-GCM encrypt/decrypt
  - `src/gateway/middleware/adminAuth.ts` — admin key auth
  - `src/gateway/validation/schemas.ts` — input validation
  - AGENTS.md § "Key Conventions" — multi-tenancy mandate, soft delete
  - AGENTS.md § "Tenants" — VLRE_SLACK_BOT_TOKEN seed-only rule

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Security skill references encryption + tenant isolation
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/security/SKILL.md
      2. Run: grep "encryption.ts" .opencode/skills/security/SKILL.md
      3. Run: grep -c "tenant_id\|tenant_secrets\|ENCRYPTION_KEY" .opencode/skills/security/SKILL.md
      4. Run: grep -ci "never\|must not\|do not" .opencode/skills/security/SKILL.md
      5. Run: wc -l .opencode/skills/security/SKILL.md
    Expected Result: Valid frontmatter, encryption.ts referenced, ≥2 tenant refs, ≥4 prohibition rules, 50–400 lines
    Evidence: .sisyphus/evidence/task-5-security-content.txt
  ```

  **Commit**: YES (groups with Tasks 1–4)

- [ ] 6. Feature Verification Skill (Extract from AGENTS.md)

  **What to do**:
  - Extract the entire "Feature Verification Checklist (MANDATORY)" section from AGENTS.md (~119 lines) into `.opencode/skills/feature-verification/SKILL.md`
  - Frontmatter: `name: feature-verification`, `description: "Use when verifying a completed feature end-to-end. Covers the PostgREST-vs-psql distinction, the zero-rows-is-failure rule, dashboard real-data verification, the real-world verification matrix, and the recommended smoke-test employee (real-estate-motivation-bot-2)."`
  - Include ALL content from these AGENTS.md subsections: "PostgREST ≠ psql", "Zero Rows Is Never Expected", "Dashboard UI Must Show Real Data", "Real-World Verification Matrix", "What Verified Means", "Recommended Test Employee" — preserve exact commands, code blocks, archetype IDs
  - This is a lossless MOVE, not a rewrite. Add frontmatter and adapt heading levels to skill convention only.

  **Must NOT do**:
  - Summarize or compress — extraction must be lossless
  - Add new rules not in the source section
  - Exceed 400 lines (if the source is larger, keep every command but trim prose connective tissue only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical copy-with-frontmatter — no synthesis required
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1–5, 7–9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` § "Feature Verification Checklist (MANDATORY — applies to every plan)" — SOURCE
  - `.opencode/skills/adding-shell-tools/SKILL.md` — canonical format

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feature-verification skill is complete and lossless
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/feature-verification/SKILL.md
      2. Run: grep -c "PostgREST\|psql\|Zero Rows\|real-estate-motivation-bot" .opencode/skills/feature-verification/SKILL.md
      3. Run: grep "NOTIFY pgrst" .opencode/skills/feature-verification/SKILL.md
      4. Run: grep "localhost:54331" .opencode/skills/feature-verification/SKILL.md
      5. Run: grep "561439b9" .opencode/skills/feature-verification/SKILL.md
      6. Run: wc -l .opencode/skills/feature-verification/SKILL.md
    Expected Result: Valid frontmatter, ≥3 key concept refs, NOTIFY pgrst + PostgREST curl + test-employee archetype ID all present, 80–400 lines
    Evidence: .sisyphus/evidence/task-6-feature-verification-content.txt
  ```

  **Commit**: YES (groups with Tasks 7–9)
  - Message: `feat(skills): add 4 AGENTS.md extraction skills`
  - Files: `.opencode/skills/feature-verification/SKILL.md`

- [ ] 7. Production Ops Skill (Extract from AGENTS.md — Strip API Key)

  **What to do**:
  - Extract "Render API (Production Gateway)" from AGENTS.md (~42 lines) into `.opencode/skills/production-ops/SKILL.md`
  - Frontmatter: `name: production-ops`, `description: "Use when debugging production issues, checking Render deploys, fetching runtime logs, or updating production service config. Covers the Render API commands, service ID, deploy-status checks, env-var PUT gotcha, and known API quirks."`
  - Include ALL content: base URL, auth header, service ID, every curl example (check deploy, trigger deploy, update config, set env vars, get logs), the known-quirks list
  - **CRITICAL SECURITY FIX**: replace the hardcoded key `rnd_0XF5Yo08XVffYVQReUx0VisS1xSp` everywhere with `$RENDER_API_KEY`; add a line noting the key lives in `.env` as `RENDER_API_KEY`
  - Add a pointer: "Load `docs/guides/2026-06-01-2246-production-debugging-guide.md` for full production debugging methodology."

  **Must NOT do**:
  - Carry the hardcoded Render API key into the skill (this is the whole point of the fix)
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical move + a find/replace on the key — no synthesis
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1–6, 8–9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` § "Render API (Production Gateway)" — SOURCE
  - `.env.example` — `RENDER_API_KEY`, `RENDER_SERVICE_ID` documentation

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Production-ops skill has commands but no hardcoded key
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/production-ops/SKILL.md
      2. Run: grep -c "api.render.com" .opencode/skills/production-ops/SKILL.md
      3. Run: grep "rnd_0XF5" .opencode/skills/production-ops/SKILL.md
      4. Run: grep "RENDER_API_KEY" .opencode/skills/production-ops/SKILL.md
      5. Run: wc -l .opencode/skills/production-ops/SKILL.md
    Expected Result: Valid frontmatter, ≥3 render.com curl refs, ZERO matches for rnd_0XF5 (key stripped), $RENDER_API_KEY present, 50–400 lines
    Evidence: .sisyphus/evidence/task-7-production-ops-content.txt
  ```

  **Commit**: YES (groups with Tasks 6, 8–9)

- [ ] 8. Slack Conventions Skill (Extract from AGENTS.md)

  **What to do**:
  - Extract 3 Slack sections from AGENTS.md into `.opencode/skills/slack-conventions/SKILL.md`: "Slack Interactive Buttons — Socket Mode (CRITICAL)" (~12 lines), "Slack Message Standards" (~15 lines), "Slack Message Hygiene (MANDATORY — No Message Accumulation)" (~12 lines)
  - Frontmatter: `name: slack-conventions`, `description: "Use when posting Slack messages, building Block Kit payloads, handling interactive buttons, or implementing approval cards. Covers Socket Mode (never configure an Interactivity URL), the mandatory task-ID context block, user-mention syntax, message-update hygiene, and the manual approval fallback."`
  - Include ALL content: Socket Mode rule + the manual approval fallback curl; the trailing task-ID context block requirement; `<@userId>` mrkdwn syntax; `chat.update` for status progression (capture and reuse `ts`); thread replies via `thread_ts`; never discard a `postMessage` `ts`; terminal states must update the original message
  - Keep the reference-implementation file pointers from the source sections

  **Must NOT do**:
  - Add Slack API docs beyond the source sections
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical move of three small sections
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1–7, 9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` §§ "Slack Interactive Buttons", "Slack Message Standards", "Slack Message Hygiene" — SOURCE
  - `src/inngest/employee-lifecycle.ts` — approval-card / message-update reference impl
  - `src/worker-tools/slack/post-message.ts` — `buildApprovalBlocks`
  - `src/lib/slack-action-ids.ts` — action ID constants

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Slack-conventions skill has all 3 sections' content
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/slack-conventions/SKILL.md
      2. Run: grep -c "Socket Mode\|chat.update\|thread_ts\|context" .opencode/skills/slack-conventions/SKILL.md
      3. Run: grep -i "manual approval" .opencode/skills/slack-conventions/SKILL.md
      4. Run: grep -ci "never\|must\|mandatory" .opencode/skills/slack-conventions/SKILL.md
      5. Run: wc -l .opencode/skills/slack-conventions/SKILL.md
    Expected Result: Valid frontmatter, ≥4 key-concept refs, manual approval fallback present, ≥4 requirement rules, 50–400 lines
    Evidence: .sisyphus/evidence/task-8-slack-conventions-content.txt
  ```

  **Commit**: YES (groups with Tasks 6–7, 9)

- [ ] 9. Long-Running Commands Skill (Extract from AGENTS.md)

  **What to do**:
  - Extract "Long-Running Commands" + "Tmux Session Cleanup (MANDATORY)" from AGENTS.md (~51 lines) into `.opencode/skills/long-running-commands/SKILL.md`
  - Frontmatter: `name: long-running-commands`, `description: "Use when running any command expected to take >30 seconds (docker build, pnpm dev, pnpm trigger-task, fly logs, cloudflared). Covers the tmux launch+poll pattern, the 5 mandatory cleanup rules, session naming, and the macOS vnode-exhaustion risk."`
  - Include ALL content: the 30-second rule; tmux launch template; poll template; session naming (`ai-e2e`, `ai-dev`, `ai-build`); log locations (`/tmp/ai-*.log`); all 5 cleanup rules; the vnode/ENFILE explanation; the project-specific always-tmux command list (`pnpm trigger-task`, `pnpm dev`, `docker build`, `fly logs`, `cloudflared tunnel`)

  **Must NOT do**:
  - Add generic tmux tutorial content
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical move
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1–8)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` §§ "Long-Running Commands", "Tmux Session Cleanup (MANDATORY)" — SOURCE
  - `.opencode/skills/adding-shell-tools/SKILL.md` — canonical format

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Long-running-commands skill has tmux patterns + cleanup rules
    Tool: Bash
    Steps:
      1. Run: head -3 .opencode/skills/long-running-commands/SKILL.md
      2. Run: grep -c "tmux new-session\|tmux kill-session\|tmux list-sessions" .opencode/skills/long-running-commands/SKILL.md
      3. Run: grep -i "vnode\|maxvnodes\|ENFILE" .opencode/skills/long-running-commands/SKILL.md
      4. Run: grep -c "pnpm trigger-task\|pnpm dev\|docker build\|fly logs\|cloudflared" .opencode/skills/long-running-commands/SKILL.md
      5. Run: wc -l .opencode/skills/long-running-commands/SKILL.md
    Expected Result: Valid frontmatter, ≥3 tmux command refs, vnode risk mentioned, ≥3 always-tmux commands listed, 50–400 lines
    Evidence: .sisyphus/evidence/task-9-long-running-content.txt
  ```

  **Commit**: YES (groups with Tasks 6–8)

---

- [ ] 10. AGENTS.md Surgery + Merges + Stale-Model Fix

  **What to do**:
  The integration task. Execute in order:

  **A. Merge "Task Debugging Quick Reference" into `debugging-lifecycle` skill:**
  - Append AGENTS.md § "Task Debugging Quick Reference" (~65 lines) to `.opencode/skills/debugging-lifecycle/SKILL.md` under a new `## Quick Reference Commands` heading
  - Preserve every command (psql status, lifecycle trace, docker logs, harness log, execution metrics, Slack thread). Keep total ≤400 lines.

  **B. Replace 6 AGENTS.md sections with 1-line pointers** (do NOT delete headings):
  1. "Feature Verification Checklist" → `**[Moved to skill]** — Load \`feature-verification\` skill for the full checklist, PostgREST verification, and smoke-test employee.`
  2. "Render API (Production Gateway)" → `**[Moved to skill]** — Load \`production-ops\` skill for Render API commands, deploy checks, and known quirks.`
  3. "Slack Interactive Buttons" + "Slack Message Standards" + "Slack Message Hygiene" → `**[Moved to skill]** — Load \`slack-conventions\` skill for Socket Mode, message standards, hygiene, and the manual approval fallback.`
  4. "Long-Running Commands" + "Tmux Session Cleanup" → `**[Moved to skill]** — Load \`long-running-commands\` skill for tmux patterns, cleanup rules, and session naming.`
  5. "Task Debugging Quick Reference" → `**[Moved to skill]** — Load \`debugging-lifecycle\` skill for task debugging commands and stuck-state diagnostics.`
  6. "Admin API" → `**[Moved to skill]** — Load \`api-design\` skill for the full admin API endpoint table and curl examples.`

  **C. Absorb "Known Issues":** fold the 3 known-issue write-ups into the relevant skills during their Wave-1 creation is NOT possible (those skills are already written), so instead append each to the matching skill here if missing, then replace the AGENTS.md section with: `**[Moved to skills]** — Known issues live in \`production-ops\` (tunnels), \`slack-conventions\` (OAuth redirect), and \`inngest\` (Dev Server contamination).` If appending would push a skill >400 lines, leave the issue text in AGENTS.md and skip the pointer for that one.

  **D. Add 9 rows to the AGENTS.md Skills System trigger table** (the "If you are about to… | Load this skill" table), using each new skill's `description` frontmatter for SPECIFIC trigger wording (never vague like "write code"): `prisma`, `inngest`, `api-design`, `react-dashboard`, `security`, `feature-verification`, `production-ops`, `slack-conventions`, `long-running-commands`

  **E. Add 9 rows to the AGENTS.md "Dev skills" table**

  **F. Fix stale model reference** in `.opencode/skills/creating-archetypes/SKILL.md`: if it references `anthropic/claude-haiku-4-5` or any forbidden model, replace with a reference to the model catalog / recommendation engine

  **G. Verify line count:** `wc -l AGENTS.md` → target ≤530

  **Must NOT do**:
  - Delete any AGENTS.md section without leaving a pointer
  - Reorder or alter AGENTS.md sections that are NOT being extracted
  - Use vague trigger descriptions
  - Touch `debugging-lifecycle/SKILL.md` beyond the Quick Reference append (and any Known-Issue append in step C)
  - Create rows for any of the 6 cut skills

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-file surgery on the most critical shared file; careful content transfer and line accounting
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after all Wave 1 tasks)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1–9

  **References**:
  - `AGENTS.md` — full file, all sections being extracted/modified
  - `.opencode/skills/debugging-lifecycle/SKILL.md` — receives merged content
  - `.opencode/skills/creating-archetypes/SKILL.md` — stale model fix
  - All 9 new SKILL.md files — read `description` frontmatter for trigger wording

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md has 14 dev-skill entries and reduced line count
    Tool: Bash
    Steps:
      1. Run: grep -c "adding-shell-tools\|creating-archetypes\|debugging-lifecycle\|e2e-testing\|hostfully-api\|prisma\|inngest\|api-design\|react-dashboard\|security\|feature-verification\|production-ops\|slack-conventions\|long-running-commands" AGENTS.md
      2. Run: wc -l AGENTS.md
      3. Run: grep -c "Moved to skill" AGENTS.md
    Expected Result: ≥28 skill-name matches (14 skills × 2 table appearances), ≤530 lines, ≥5 "Moved to skill" pointers
    Evidence: .sisyphus/evidence/task-10-agents-md-surgery.txt

  Scenario: Merges landed and stale model fixed
    Tool: Bash
    Steps:
      1. Run: grep -c "task_status_log\|docker logs\|harness log" .opencode/skills/debugging-lifecycle/SKILL.md
      2. Run: wc -l .opencode/skills/debugging-lifecycle/SKILL.md
      3. Run: grep -c "admin/tenants" .opencode/skills/api-design/SKILL.md
      4. Run: grep -i "claude-haiku\|claude-sonnet\|gpt-4o\|claude-opus" .opencode/skills/creating-archetypes/SKILL.md
    Expected Result: ≥3 debug commands in debugging-lifecycle (≤400 lines total), admin table in api-design, ZERO forbidden models in creating-archetypes
    Evidence: .sisyphus/evidence/task-10-merges-and-fix.txt

  Scenario: No cut-skill rows were added
    Tool: Bash
    Steps:
      1. Run: grep -E "Load this skill.*\b(typescript|docker|vitest|error-handling|git-commits|code-review)\b" AGENTS.md
    Expected Result: Empty (none of the 6 cut skills appear as a dev-skill trigger)
    Evidence: .sisyphus/evidence/task-10-no-cut-skills.txt
  ```

  **Commit**: YES
  - Message: `docs(agents-md): extract 6 sections into skills, add 9 triggers, slim ~350 lines`
  - Files: `AGENTS.md`, `.opencode/skills/debugging-lifecycle/SKILL.md`, `.opencode/skills/creating-archetypes/SKILL.md`

- [ ] 11. Skill Usefulness Eval (Before/After Validation)

  **What to do**:
  - This task answers the real question: "do these skills actually change agent behavior, or are they passing greps while adding noise?"
  - Pick 3 representative micro-tasks that map to the highest-value skills:
    1. **Inngest**: "Describe how you would add a new step to the employee lifecycle that posts a metric after Delivering" (maps to `inngest`)
    2. **API/Prisma**: "Describe how you would add a new admin endpoint `GET /admin/tenants/:tenantId/widgets` backed by a new `widgets` table" (maps to `api-design` + `prisma`)
    3. **Dashboard**: "Describe how you would add a status filter dropdown to the tasks page" (maps to `react-dashboard`)
  - For EACH micro-task, produce two short answers: (A) WITHOUT the skill loaded (baseline — what a model does from AGENTS.md alone), (B) WITH the skill loaded. Capture both.
  - Judge each pair: did the skill surface something the baseline missed or got wrong? Record a verdict: **STRONG** (skill prevented a real mistake — e.g. used `UUID_REGEX` not `z.string().uuid()`, reloaded PostgREST cache, used `SearchableSelect` + `useSearchParams`), **MARGINAL** (skill restated what baseline already knew), or **CUT** (skill added noise / no delta)
  - Write `.sisyphus/evidence/skill-usefulness-eval.md` with: the 3 micro-tasks, the A/B answers (or a faithful summary), and a per-skill verdict table covering all 9 skills (the 6 not directly tested get a reasoned verdict based on whether their content is non-obvious vs generic)
  - Be honest: if a skill is MARGINAL, say so and recommend trimming or cutting it. The goal is signal, not validation theater.

  **Must NOT do**:
  - Rubber-stamp every skill as useful — the eval is worthless if it can't say "cut this"
  - Modify any skill file (this task only observes and reports; trimming is a follow-up decision for the user)
  - Skip the baseline (A) answer — without it there's no comparison

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires genuine judgment comparing model outputs and calling out low-value skills honestly
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 10)
  - **Blocks**: Task 12
  - **Blocked By**: Task 10

  **References**:
  - All 9 new SKILL.md files — the subjects of the eval
  - `AGENTS.md` — the baseline knowledge source (what's available without skills)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Eval report exists with honest per-skill verdicts
    Tool: Bash
    Steps:
      1. Run: test -f .sisyphus/evidence/skill-usefulness-eval.md && echo "EXISTS"
      2. Run: grep -ci "STRONG\|MARGINAL\|CUT" .sisyphus/evidence/skill-usefulness-eval.md
      3. Run: grep -c "prisma\|inngest\|api-design\|react-dashboard\|security\|feature-verification\|production-ops\|slack-conventions\|long-running-commands" .sisyphus/evidence/skill-usefulness-eval.md
      4. Run: grep -ci "baseline\|without.*skill\|with.*skill" .sisyphus/evidence/skill-usefulness-eval.md
    Expected Result: File exists, ≥9 verdict labels (one per skill), all 9 skills named, before/after framing present
    Evidence: .sisyphus/evidence/task-11-eval-meta.txt
  ```

  **Commit**: YES
  - Message: `docs(skills): add skill usefulness eval`
  - Files: `.sisyphus/evidence/skill-usefulness-eval.md`

- [ ] 12. Send Telegram Notification

  **What to do**:
  - Run: `npx tsx scripts/telegram-notify.ts "✅ Lean Skill Library complete — 9 skills written, AGENTS.md slimmed ~350 lines, usefulness eval done. Come back to review results (esp. the eval verdicts)."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 11)
  - **Blocks**: F1–F4
  - **Blocked By**: Task 11

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run the npx tsx command above
    Expected Result: Exit code 0, "[telegram] Notification sent." in output
    Evidence: .sisyphus/evidence/task-12-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed after verification.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for required content). For each "Must NOT Have": search for forbidden patterns — reject with file:line if found (especially: any of the 6 cut skills accidentally created; `git-commits`/`code-review` collisions). Verify exactly 14 skill directories (`ls .opencode/skills/ | wc -l`). Verify AGENTS.md ≤530 lines. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Skills [14/14] | AGENTS.md Lines [N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `wc -l .opencode/skills/*/SKILL.md` — every new file ≥50 and ≤400 lines. Run `grep -rn "claude-sonnet\|gpt-4o\|claude-opus\|claude-haiku" .opencode/skills/` and `grep -rn "rnd_0XF5" .opencode/skills/` — both must be empty. Verify every new SKILL.md has valid frontmatter (`---`, `name:`, `description:` starting with "Use when", `name` matching directory). Check for broken file-path references and markdown issues.
      Output: `Line Counts [PASS/FAIL] | Forbidden Patterns [PASS/FAIL] | Hardcoded Keys [PASS/FAIL] | Frontmatter [N/N valid] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      For each of the 9 new skills: read it fully, verify every file-path reference points to a real file, verify `name` matches directory, verify `description` starts with "Use when". Verify AGENTS.md has 14 dev-skill rows and every "Moved to skill" pointer references a skill that exists. Verify `debugging-lifecycle/SKILL.md` contains the merged Quick Reference commands and `api-design/SKILL.md` contains the absorbed Admin API table. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Skills [N/N valid] | File Refs [N verified/N broken] | AGENTS.md [PASS/FAIL] | Merges [2/2] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual file. Verify 1:1 — everything in spec was built, nothing beyond spec. Confirm NONE of the 6 cut skills were created. For extraction skills: verify content matches the original AGENTS.md section (lossless, not summarized). Verify no project-specific skill duplicates AGENTS.md verbatim. Verify the stale-model fix and API-key removal landed. Read `skill-usefulness-eval.md` and confirm it contains an honest per-skill verdict.
      Output: `Tasks [N/N compliant] | No Cut Skills [PASS/FAIL] | Extraction Fidelity [PASS/FAIL] | Eval Honest [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **Wave 1a (project-specific skills)**: `feat(skills): add 5 project-specific engineering skills` — Tasks 1–5
- **Wave 1b (extraction skills)**: `feat(skills): add 4 AGENTS.md extraction skills` — Tasks 6–9
- **Wave 2**: `docs(agents-md): extract 6 sections into skills, add 9 triggers, slim ~350 lines` — AGENTS.md + debugging-lifecycle merge + creating-archetypes fix
- **Task 11**: `docs(skills): add skill usefulness eval` — eval report only (no code)

---

## Success Criteria

### Verification Commands

```bash
# Count skill directories (expect 14)
ls .opencode/skills/ | wc -l

# AGENTS.md line count (expect ≤530, down from ~819)
wc -l AGENTS.md

# Line count bounds (all new skills ≥50, ≤400)
wc -l .opencode/skills/*/SKILL.md

# No forbidden model names / hardcoded keys
grep -rn "claude-sonnet\|gpt-4o\|claude-opus\|claude-haiku" .opencode/skills/
grep -rn "rnd_0XF5" .opencode/skills/

# None of the 6 cut skills exist
ls .opencode/skills/ | grep -E "^(typescript|docker|vitest|error-handling|git-commits|code-review)$"  # expect empty

# Frontmatter spot checks
head -5 .opencode/skills/inngest/SKILL.md | grep "^name: inngest"
head -5 .opencode/skills/feature-verification/SKILL.md | grep "^name: feature-verification"

# AGENTS.md extraction pointers present
grep -c "Moved to skill" AGENTS.md

# Merges landed
grep -c "task_status_log\|docker logs" .opencode/skills/debugging-lifecycle/SKILL.md
grep -c "admin/tenants" .opencode/skills/api-design/SKILL.md

# Inngest + Prisma + Security signal
grep -c "universal-lifecycle\|interaction-handler\|rule-extractor\|rule-synthesizer\|reviewing-watchdog" .opencode/skills/inngest/SKILL.md
grep "NOTIFY pgrst" .opencode/skills/prisma/SKILL.md
grep "encryption.ts" .opencode/skills/security/SKILL.md

# Eval exists
test -f .sisyphus/evidence/skill-usefulness-eval.md && echo "EVAL EXISTS"
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (especially: no cut skills, no built-in collisions)
- [ ] 14 skill directories total (5 existing + 9 new)
- [ ] AGENTS.md ≤530 lines (down from ~819)
- [ ] AGENTS.md updated with all 9 new skill trigger entries
- [ ] Extracted sections replaced with skill pointers
- [ ] Both merges landed (debugging-lifecycle, api-design)
- [ ] Stale model reference fixed; Render API key removed
- [ ] Usefulness eval written with honest per-skill verdict
- [ ] All tests still pass (`pnpm test -- --run`)
