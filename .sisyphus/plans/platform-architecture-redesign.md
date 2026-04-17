# Platform Architecture Redesign

## TL;DR

> **Quick Summary**: Redesign the AI Employee Platform to enforce approved LLM models (MiniMax M2.7 + Haiku 4.5 only), unify the task lifecycle state machine, replace the deterministic generic harness with OpenCode for all employees, extract Slack integration into a `tenant_integrations` table, add missing schema timestamps, implement a bidirectional feedback pipeline with Slack thread replies and @mentions, and spawn a post-approval Fly.io machine for delivery.
>
> **Deliverables**:
>
> - AGENTS.md updated with model constraints + engineering deprecation
> - Prisma schema migration: timestamps on all tables + `tenant_integrations` table
> - All model references changed to MiniMax M2.7 / Haiku 4.5 (seed, tools, pricing, tests)
> - Unified lifecycle state machine (all states, auto-pass where appropriate)
> - OpenCode-based summarizer worker (natural language instructions, shell tools)
> - Post-approval Fly.io machine spawn for delivery
> - Feedback pipeline: thread reply capture, Haiku acknowledgment, @mention handling
> - Feedback injection into future employee runs
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Schema migrations → Tenant integration migration → Unified lifecycle → OpenCode worker → Post-approval delivery → Feedback pipeline → Final verification

---

## Context

### Original Request

User identified multiple architectural gaps between the vision document and current implementation after completing the multi-tenancy + Papi Chulo summarizer work. Key concerns: deterministic step-by-step harness should be replaced with OpenCode for all employees; lifecycle should be universal (all states, auto-pass); only approved LLMs should be used; `slack_team_id` is not future-proof; feedback pipeline is missing; post-approval actions should spawn a machine, not run inline.

### Interview Summary

**Key Discussions**:

- **LLM models**: User explicitly and repeatedly stated ONLY MiniMax M2.7 and Claude Haiku 4.5. No exceptions. No Sonnet, Opus, GPT-4o. Previous sessions already established this constraint but it was not enforced.
- **Engineering employee**: Deprecated for now. Don't touch `lifecycle.ts`. Mark as deprecated in AGENTS.md.
- **Generic harness**: Should be replaced with OpenCode. Archetype should use natural language instructions, not deterministic tool sequences.
- **Unified lifecycle**: All employees traverse all states. States auto-pass where appropriate. One code path.
- **Post-approval**: On approve, spawn a Fly.io machine for delivery instead of inline Slack posting.
- **Feedback**: Bidirectional — capture thread replies and @mentions, acknowledge with inline Haiku call, store in feedback table, inject into future runs.
- **Tenant integrations**: Move `slack_team_id` to a separate `tenant_integrations` table for multi-provider future.
- **Corrective action**: Acknowledge + learn only. No re-execution from feedback.
- **@mentions**: Included in this plan. Employee determines intent (feedback, teaching, new task).

### Self-Review (in lieu of Metis — 50 descendant session limit)

**Identified Gaps** (addressed):

- Model pricing for MiniMax M2.7 and Haiku 4.5 needs to be researched and added to `call-llm.ts`
- OpenCode configuration for non-engineering employees needs to be designed (system prompt injection, tool discovery)
- The `steps` column on archetypes needs a migration strategy (add `instructions`, deprecate `steps`)
- Thread reply matching needs a mechanism to link `thread_ts` to deliverables
- @mention handler needs to know which archetype/employee is being mentioned (bot user ID → archetype mapping)
- Feedback table currently has no `content` or `raw_text` column — needs schema check

---

## Work Objectives

### Core Objective

Transform the AI Employee Platform from a dual-path architecture (OpenCode for engineering, deterministic harness for others) into a unified architecture where every employee uses OpenCode, follows the same lifecycle state machine, uses only approved LLMs, and learns from human feedback.

### Concrete Deliverables

- Updated `AGENTS.md` with enforced model constraints and engineering deprecation
- Prisma migration adding `updated_at` to 12 tables, `created_at` to 1 table
- New `tenant_integrations` table + Prisma model + repository service
- All `slack_team_id` references migrated to `tenant_integrations`
- `call-llm.ts` pricing table with only MiniMax M2.7 + Haiku 4.5
- Seed data using only approved models
- `llm-generate.ts` fallback using approved model
- Unified lifecycle function implementing full state machine
- Shell scripts for summarizer tools at `src/worker-tools/slack/`
- OpenCode worker entry point for non-engineering employees
- Archetype config with `instructions` field (natural language)
- Post-approval machine spawn in lifecycle
- Bolt `message` event listener for thread reply feedback
- Bolt `app_mention` event listener for @mentions
- Feedback ingestion, response, summarization, and injection services
- Tests for all new components

### Definition of Done

- [ ] `pnpm build` passes with zero errors
- [ ] `pnpm test -- --run` passes (515+ existing tests, plus new tests)
- [ ] `pnpm lint` passes
- [ ] Summarizer triggered manually → OpenCode generates summary → posts for approval → approved → published via delivery machine
- [ ] Thread reply on published summary → employee acknowledges in thread
- [ ] @mention to employee → employee classifies intent and responds
- [ ] No references to `anthropic/claude-sonnet` or `anthropic/claude-opus` or `openai/gpt-4o` in production code or seed data
- [ ] `slack_team_id` column removed from tenants table
- [ ] All tables have `created_at` and `updated_at` columns

### Must Have

- Only MiniMax M2.7 and Haiku 4.5 in all production code, seeds, and defaults
- One unified lifecycle function for all non-deprecated employees
- OpenCode as the runtime for the summarizer employee
- Natural language instructions in archetype (not deterministic steps)
- `tenant_integrations` table replacing `slack_team_id` on tenants
- Thread reply feedback with acknowledgment
- @mention handling with intent classification
- All tables with `created_at` + `updated_at`

### Must NOT Have (Guardrails)

- NO references to claude-sonnet, claude-opus, gpt-4o, or any non-approved model in production code
- NO changes to `src/inngest/lifecycle.ts` (engineering lifecycle — deprecated)
- NO generic harness code remaining in final state (deleted)
- NO per-employee branching in the lifecycle function
- NO human-only acceptance criteria — everything agent-verifiable
- NO MCP servers for tool access — shell scripts only (vision doc constraint)
- NO new engineering employee features
- NO autonomous mode implementation (supervised only for now)
- NO knowledge base / pgvector implementation (deferred)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (`pnpm test -- --run`)
- **Each task**: Implement first, then write tests

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **CLI/Worker**: Use interactive_bash (tmux) — Run command, validate output
- **Slack Integration**: Use curl against Supabase PostgREST to verify data, plus Slack API calls where possible

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all parallel, no dependencies):
├── Task 1:  AGENTS.md updates (model constraints + engineering deprecation) [quick]
├── Task 2:  Schema migration: add timestamps to all tables [quick]
├── Task 3:  Schema migration: create tenant_integrations table [quick]
├── Task 4:  Schema migration: add instructions field to archetypes [quick]
├── Task 5:  Model enforcement: call-llm.ts pricing table [quick]
├── Task 6:  Model enforcement: seed.ts + llm-generate.ts fallback [quick]
├── Task 7:  Model enforcement: update test fixtures [unspecified-high]
└── Task 8:  Create TenantIntegrationRepository service [unspecified-high]

Wave 2 (Core migrations — depends on Wave 1):
├── Task 9:  Migrate TenantInstallationStore to tenant_integrations (depends: 3, 8) [unspecified-high]
├── Task 10: Migrate slack-oauth.ts to tenant_integrations (depends: 3, 8) [unspecified-high]
├── Task 11: Migrate scripts + tenant-repository to tenant_integrations (depends: 9, 10) [unspecified-high]
├── Task 12: Create shell tools: src/worker-tools/slack/ (depends: 5, 6) [unspecified-high]
├── Task 13: Create OpenCode worker entry point for employees (depends: 12) [deep]
└── Task 14: Implement unified lifecycle state machine (depends: 4) [deep]

Wave 3 (OpenCode + Feedback infra — depends on Wave 2):
├── Task 15: Update archetype config: instructions + model (depends: 4, 6, 13) [unspecified-high]
├── Task 16: Update lifecycle to spawn OpenCode worker (depends: 13, 14) [deep]
├── Task 17: Post-approval: spawn delivery machine (depends: 14, 16) [deep]
├── Task 18: Register Bolt message event listener for thread replies (depends: none) [unspecified-high]
├── Task 19: Create feedback ingestion service (depends: 18) [unspecified-high]
├── Task 20: Register Bolt app_mention event listener (depends: 18) [unspecified-high]
└── Task 21: Create @mention intent classifier + handler (depends: 20) [deep]

Wave 4 (Feedback responses + learning + cleanup — depends on Wave 3):
├── Task 22: Create feedback response function (inline Haiku call) (depends: 5, 19) [unspecified-high]
├── Task 23: Create periodic feedback summarization cron (depends: 19) [unspecified-high]
├── Task 24: Create feedback injection at task start (depends: 23) [deep]
├── Task 25: End-to-end: OpenCode summarizer full flow (depends: 15, 16, 17) [deep]
├── Task 26: Cleanup: drop slack_team_id, delete generic harness + tools (depends: 11, 16) [unspecified-high]
└── Task 27: Tests for all new components (depends: all above) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Critical Path

Task 1 → Task 4 → Task 14 → Task 16 → Task 17 → Task 25 → F1-F4 → user okay

### Dependency Matrix

| Task | Depends On | Blocks   | Wave |
| ---- | ---------- | -------- | ---- |
| 1    | —          | 14       | 1    |
| 2    | —          | 26       | 1    |
| 3    | —          | 8, 9, 10 | 1    |
| 4    | —          | 14, 15   | 1    |
| 5    | —          | 12, 22   | 1    |
| 6    | —          | 12, 15   | 1    |
| 7    | —          | 27       | 1    |
| 8    | 3          | 9, 10    | 1    |
| 9    | 3, 8       | 11       | 2    |
| 10   | 3, 8       | 11       | 2    |
| 11   | 9, 10      | 26       | 2    |
| 12   | 5, 6       | 13       | 2    |
| 13   | 12         | 15, 16   | 2    |
| 14   | 4          | 16, 17   | 2    |
| 15   | 4, 6, 13   | 25       | 3    |
| 16   | 13, 14     | 17, 25   | 3    |
| 17   | 14, 16     | 25       | 3    |
| 18   | —          | 19, 20   | 3    |
| 19   | 18         | 22, 23   | 3    |
| 20   | 18         | 21       | 3    |
| 21   | 20         | 27       | 3    |
| 22   | 5, 19      | 27       | 4    |
| 23   | 19         | 24       | 4    |
| 24   | 23         | 27       | 4    |
| 25   | 15, 16, 17 | F1-F4    | 4    |
| 26   | 11, 16     | F1-F4    | 4    |
| 27   | all        | F1-F4    | 4    |

### Agent Dispatch Summary

- **Wave 1**: **8 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`, T5 → `quick`, T6 → `quick`, T7 → `unspecified-high`, T8 → `unspecified-high`
- **Wave 2**: **6 tasks** — T9 → `unspecified-high`, T10 → `unspecified-high`, T11 → `unspecified-high`, T12 → `unspecified-high`, T13 → `deep`, T14 → `deep`
- **Wave 3**: **7 tasks** — T15 → `unspecified-high`, T16 → `deep`, T17 → `deep`, T18 → `unspecified-high`, T19 → `unspecified-high`, T20 → `unspecified-high`, T21 → `deep`
- **Wave 4**: **6 tasks** — T22 → `unspecified-high`, T23 → `unspecified-high`, T24 → `deep`, T25 → `deep`, T26 → `unspecified-high`, T27 → `unspecified-high`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Update AGENTS.md with LLM model constraints and engineering deprecation

  **What to do**:
  - Add a new section `## Approved LLM Models` to AGENTS.md with explicit constraint: ONLY `minimax/minimax-m2.7` (primary/execution) and `anthropic/claude-haiku-4-5` (verification/judge). No other models permitted. Any code referencing other models is a bug.
  - Add a new section `## Deprecated Components` marking `src/inngest/lifecycle.ts` (engineering task lifecycle) as deprecated. Do not modify, do not add features, do not fix unless explicitly instructed.
  - Add MiniMax M2.7 and Haiku 4.5 to the pricing/model references in the document
  - Update any existing model references in AGENTS.md that mention Sonnet or other models

  **Must NOT do**:
  - Do not modify any code files — this task is AGENTS.md only
  - Do not remove the engineering lifecycle code — just document its deprecation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-8)
  - **Blocks**: Task 14 (needs to know deprecated status)
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` — Current file to edit. Read full content before modifying.
  - `docs/2026-04-14-0104-full-system-vision.md:98` — Vision doc model_config: `{primary: "minimax-m2.7", verifier: "haiku-4.5"}`
  - `src/inngest/lifecycle.ts` — Engineering lifecycle to mark as deprecated (do NOT modify the file itself)

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md contains model constraints
    Tool: Bash (grep)
    Steps:
      1. grep -c "minimax/minimax-m2.7" AGENTS.md
      2. grep -c "claude-haiku-4-5" AGENTS.md
      3. grep -c "Deprecated" AGENTS.md
    Expected Result: All three grep commands return count >= 1
    Evidence: .sisyphus/evidence/task-1-agents-md-constraints.txt

  Scenario: No unauthorized models mentioned as approved
    Tool: Bash (grep)
    Steps:
      1. grep -i "claude-sonnet\|claude-opus\|gpt-4o" AGENTS.md | grep -v "deprecated\|removed\|do not use\|forbidden"
    Expected Result: Zero lines returned (any mention of these models is in a "do not use" context only)
    Evidence: .sisyphus/evidence/task-1-no-unauthorized-models.txt
  ```

  **Commit**: YES (group with T1 solo)
  - Message: `docs: enforce LLM model constraints and deprecate engineering lifecycle in AGENTS.md`
  - Files: `AGENTS.md`
  - Pre-commit: `pnpm build`

- [x] 2. Schema migration: add timestamps to all tables

  **What to do**:
  - Add `updated_at DateTime @updatedAt` to these 12 models that are missing it: `Deliverable`, `ValidationRun`, `Feedback`, `TaskStatusLog`, `Department`, `Archetype`, `KnowledgeBase`, `RiskModel`, `CrossDeptTrigger`, `AgentVersion`, `Clarification`, `Review`, `AuditLog`
  - Add `created_at DateTime @default(now())` to `Clarification` (the only model missing it)
  - Run `npx prisma migrate dev --name add-timestamps-to-all-tables`
  - Run `npx prisma generate` to update the client
  - Verify build still passes

  **Must NOT do**:
  - Do not change any column types or rename existing columns
  - Do not add `deleted_at` to tables that don't have it yet (separate concern)
  - Do not modify any application code — schema only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-8)
  - **Blocks**: Task 26 (cleanup depends on schema being stable)
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma` — Full schema. Lines 84-100 (Deliverable — missing updated_at), 102-116 (ValidationRun — missing updated_at), 140-158 (Feedback — missing updated_at), 160-172 (TaskStatusLog — missing updated_at), 179-192 (Department — missing updated_at), 194-222 (Archetype — missing updated_at), 224-238 (KnowledgeBase — missing updated_at), 240-251 (RiskModel — missing updated_at), 253-266 (CrossDeptTrigger — missing updated_at), 268-287 (AgentVersion — missing updated_at), 289-303 (Clarification — missing BOTH), 305-320 (Review — missing updated_at), 322-336 (AuditLog — missing updated_at)
  - `prisma/schema.prisma:38-39` — Pattern to follow: `created_at DateTime @default(now())` and `updated_at DateTime @updatedAt`

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All models have both timestamp columns
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "updated_at" prisma/schema.prisma
      2. Run: grep -c "created_at" prisma/schema.prisma
      3. Run: grep -c "model " prisma/schema.prisma (count total models)
    Expected Result: updated_at count >= 18, created_at count >= 18 (matching total model count)
    Evidence: .sisyphus/evidence/task-2-timestamp-counts.txt

  Scenario: Migration runs successfully
    Tool: Bash
    Steps:
      1. Run: pnpm build
    Expected Result: Build passes with zero errors
    Evidence: .sisyphus/evidence/task-2-build-pass.txt
  ```

  **Commit**: YES (group with T3, T4)
  - Message: `feat(schema): add timestamps to all tables, tenant_integrations, archetype instructions`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `pnpm build`

- [x] 3. Schema migration: create tenant_integrations table

  **What to do**:
  - Add a new Prisma model `TenantIntegration` to `prisma/schema.prisma`:

    ```
    model TenantIntegration {
      id          String    @id @default(uuid()) @db.Uuid
      tenant_id   String    @db.Uuid
      provider    String    // 'slack', 'jira', 'github', 'linear', etc.
      external_id String    // team_id, org_id, cloud_id, etc.
      config      Json?     // provider-specific settings
      status      String    @default("active")
      created_at  DateTime  @default(now())
      updated_at  DateTime  @updatedAt
      deleted_at  DateTime?

      tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Restrict)

      @@unique([tenant_id, provider])
      @@map("tenant_integrations")
    }
    ```

  - Add the `integrations TenantIntegration[]` relation to the `Tenant` model
  - Run `npx prisma migrate dev --name add-tenant-integrations-table`
  - Run `npx prisma generate`
  - NOTE: Do NOT remove `slack_team_id` from Tenant yet — that happens in Task 26 after all references are migrated

  **Must NOT do**:
  - Do not remove `slack_team_id` from Tenant model (Task 26)
  - Do not modify any application code yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4-8)
  - **Blocks**: Tasks 8, 9, 10
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma:342-362` — Current Tenant model with `slack_team_id` column
  - `prisma/schema.prisma:364-378` — TenantSecret model — pattern for tenant-scoped table with FK
  - `docs/2026-04-14-0104-full-system-vision.md:365-366` — Vision doc mentions `tenant_integrations` table

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: tenant_integrations table exists in schema
    Tool: Bash (grep)
    Steps:
      1. grep "tenant_integrations" prisma/schema.prisma
      2. grep "TenantIntegration" prisma/schema.prisma
    Expected Result: Both return matches
    Evidence: .sisyphus/evidence/task-3-schema-check.txt

  Scenario: Migration applies cleanly
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Build passes
    Evidence: .sisyphus/evidence/task-3-build-pass.txt
  ```

  **Commit**: YES (group with T2, T4)
  - Message: `feat(schema): add timestamps to all tables, tenant_integrations, archetype instructions`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `pnpm build`

- [x] 4. Schema migration: add instructions field to archetypes

  **What to do**:
  - Add `instructions String? @db.Text` to the Archetype model in `prisma/schema.prisma` (right after `system_prompt`)
  - This is the natural language instructions field that will replace the deterministic `steps` array
  - Keep `steps Json?` for backward compatibility during migration — it will be removed in Task 26
  - Run `npx prisma migrate dev --name add-archetype-instructions`
  - Run `npx prisma generate`

  **Must NOT do**:
  - Do not remove the `steps` field yet (Task 26)
  - Do not modify seed data yet (Task 15)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5-8)
  - **Blocks**: Tasks 14, 15
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma:194-222` — Current Archetype model. Note `steps Json?` on line 207 and `system_prompt String? @db.Text` on line 206.
  - `docs/2026-04-14-0104-full-system-vision.md:86-103` — Vision doc archetype schema showing how each field maps to employee behavior

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: instructions field exists on Archetype model
    Tool: Bash (grep)
    Steps:
      1. grep "instructions" prisma/schema.prisma
    Expected Result: Returns line with `instructions String? @db.Text`
    Evidence: .sisyphus/evidence/task-4-instructions-field.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-4-build-pass.txt
  ```

  **Commit**: YES (group with T2, T3)
  - Message: `feat(schema): add timestamps to all tables, tenant_integrations, archetype instructions`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `pnpm build`

- [x] 5. Model enforcement: update call-llm.ts pricing table

  **What to do**:
  - In `src/lib/call-llm.ts`, replace the `PRICING_PER_1M_TOKENS` map (lines 31-36) to contain ONLY:
    - `'minimax/minimax-m2.7'`: research current pricing via OpenRouter (if unknown, use placeholder `{ prompt: 0.5, completion: 0.5 }` and leave a TODO)
    - `'anthropic/claude-haiku-4-5'`: `{ prompt: 0.8, completion: 4.0 }` (verify via OpenRouter pricing page)
  - Remove entries for `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-6`, `openai/gpt-4o`, `openai/gpt-4o-mini`
  - Update the JSDoc comment on the `CallLLMOptions.model` field (line 13) from `"anthropic/claude-sonnet-4-6"` to `"minimax/minimax-m2.7"`

  **Must NOT do**:
  - Do not change any other logic in call-llm.ts (retry, circuit breaker, fetch)
  - Do not change test files yet (Task 7)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 12, 22
  - **Blocked By**: None

  **References**:
  - `src/lib/call-llm.ts:31-36` — Current pricing table with unauthorized models
  - `src/lib/call-llm.ts:13` — JSDoc referencing claude-sonnet
  - OpenRouter pricing page: https://openrouter.ai/models — verify MiniMax M2.7 and Haiku 4.5 pricing

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Only approved models in pricing table
    Tool: Bash (grep)
    Steps:
      1. grep "claude-sonnet\|claude-opus\|gpt-4o" src/lib/call-llm.ts
    Expected Result: Zero lines returned
    Evidence: .sisyphus/evidence/task-5-no-unauthorized.txt

  Scenario: Approved models present in pricing table
    Tool: Bash (grep)
    Steps:
      1. grep "minimax-m2.7" src/lib/call-llm.ts
      2. grep "claude-haiku" src/lib/call-llm.ts
    Expected Result: Both return at least 1 match
    Evidence: .sisyphus/evidence/task-5-approved-models.txt
  ```

  **Commit**: YES (group with T6, T7)
  - Message: `fix(models): enforce MiniMax M2.7 + Haiku 4.5 only, remove unauthorized model references`
  - Files: `src/lib/call-llm.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Model enforcement: update seed.ts and llm-generate.ts fallback

  **What to do**:
  - In `prisma/seed.ts`:
    - Line 73: Change `model_id: 'anthropic/claude-sonnet-4-6'` to `model_id: 'minimax/minimax-m2.7'` (agent version)
    - Line 80: Same change in the update clause
    - Line 130: Change `model: 'anthropic/claude-sonnet-4-6'` to `model: 'minimax/minimax-m2.7'` (archetype create)
    - Line 166: Same change in the update clause
  - In `src/workers/tools/llm-generate.ts`:
    - Line 23: Change fallback from `'anthropic/claude-sonnet-4-20250514'` to `'minimax/minimax-m2.7'`

  **Must NOT do**:
  - Do not change the system prompt or steps in seed.ts (Task 15)
  - Do not change test fixtures (Task 7)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 12, 15
  - **Blocked By**: None

  **References**:
  - `prisma/seed.ts:73,80` — Agent version model_id references
  - `prisma/seed.ts:130,166` — Archetype model references
  - `src/workers/tools/llm-generate.ts:23` — Fallback model in the tool

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No claude-sonnet in seed.ts
    Tool: Bash (grep)
    Steps:
      1. grep "claude-sonnet" prisma/seed.ts
    Expected Result: Zero lines returned
    Evidence: .sisyphus/evidence/task-6-seed-clean.txt

  Scenario: No claude-sonnet in llm-generate.ts
    Tool: Bash (grep)
    Steps:
      1. grep "claude-sonnet" src/workers/tools/llm-generate.ts
    Expected Result: Zero lines returned
    Evidence: .sisyphus/evidence/task-6-llm-generate-clean.txt

  Scenario: Approved models used
    Tool: Bash (grep)
    Steps:
      1. grep "minimax" prisma/seed.ts
      2. grep "minimax" src/workers/tools/llm-generate.ts
    Expected Result: Both return matches
    Evidence: .sisyphus/evidence/task-6-approved-models.txt
  ```

  **Commit**: YES (group with T5, T7)
  - Message: `fix(models): enforce MiniMax M2.7 + Haiku 4.5 only, remove unauthorized model references`
  - Files: `prisma/seed.ts`, `src/workers/tools/llm-generate.ts`
  - Pre-commit: `pnpm build`

- [x] 7. Model enforcement: update test fixtures

  **What to do**:
  - Update ALL test files that reference `anthropic/claude-sonnet-4-6` or other unauthorized models to use `minimax/minimax-m2.7` instead. Key files:
    - `tests/lib/call-llm.test.ts` — ~25 references to `anthropic/claude-sonnet-4-6`
    - `tests/lib/agent-version.test.ts` — ~20 references to `claude-sonnet-4-6`
    - `tests/workers/orchestrate.test.ts` — ~4 references
    - `tests/schema.test.ts` — 1 reference
    - `tests/workers/lib/planning-orchestrator.test.ts` — reference to `claude-haiku-4-5` (this one is OK, keep it)
    - `tests/workers/lib/plan-judge.test.ts` — references to `claude-haiku-4-5` (OK, keep these)
    - `tests/workers/lib/session-manager.test.ts` — already uses `minimax/minimax-m2.7` (OK)
  - Also update the cost calculation test (line 234 `'calculates estimatedCostUsd correctly for claude-sonnet-4-6'`) to test with `minimax/minimax-m2.7`
  - Run `pnpm test -- --run` to verify all tests still pass

  **Must NOT do**:
  - Do not change test LOGIC — only change model string references
  - Do not delete tests — just update the model IDs
  - Keep `claude-haiku-4-5` references (it's an approved model)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Reason: Many files to update, need to verify tests still pass

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 27
  - **Blocked By**: None (but should run after T5 conceptually — model pricing needs to match)

  **References**:
  - `tests/lib/call-llm.test.ts` — Heaviest file, ~25 model references
  - `tests/lib/agent-version.test.ts` — ~20 references
  - `tests/workers/orchestrate.test.ts:355,565,930,970` — Model references in test data
  - `tests/schema.test.ts:201` — Schema test with model_id
  - `tests/workers/lib/session-manager.test.ts:117` — Already uses minimax (no change needed)

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No unauthorized models in test files
    Tool: Bash (grep)
    Steps:
      1. grep -r "claude-sonnet\|claude-opus\|gpt-4o" tests/
    Expected Result: Zero lines returned (haiku references are OK, but sonnet/opus/gpt should be gone)
    Evidence: .sisyphus/evidence/task-7-tests-clean.txt

  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run
    Expected Result: 515+ tests pass, 0 failures (excluding known pre-existing failures)
    Evidence: .sisyphus/evidence/task-7-test-results.txt
  ```

  **Commit**: YES (group with T5, T6)
  - Message: `fix(models): enforce MiniMax M2.7 + Haiku 4.5 only, remove unauthorized model references`
  - Files: `tests/**`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. Create TenantIntegrationRepository service

  **What to do**:
  - Create `src/gateway/services/tenant-integration-repository.ts` following the pattern of `tenant-repository.ts` and `tenant-secret-repository.ts`
  - Methods needed:
    - `findByTenantAndProvider(tenantId: string, provider: string): Promise<TenantIntegration | null>`
    - `findByExternalId(provider: string, externalId: string): Promise<TenantIntegration | null>` — replaces `findBySlackTeamId`
    - `upsert(tenantId: string, provider: string, data: { external_id: string, config?: object, status?: string }): Promise<TenantIntegration>`
    - `delete(tenantId: string, provider: string): Promise<void>` — soft delete (set `deleted_at`)
  - Write tests in `tests/gateway/services/tenant-integration-repository.test.ts`

  **Must NOT do**:
  - Do not modify existing `tenant-repository.ts` yet (Task 11)
  - Do not wire into any routes yet (Tasks 9, 10)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Reason: New service with multiple methods + tests

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Task 3 (needs the Prisma model to exist)

  **References**:
  - `src/gateway/services/tenant-repository.ts` — Pattern to follow for repository class structure, PrismaClient injection, method signatures
  - `src/gateway/services/tenant-secret-repository.ts` — Pattern for tenant-scoped data access
  - `tests/gateway/services/tenant-repository.test.ts` — Test pattern to follow
  - `prisma/schema.prisma` — TenantIntegration model (created in Task 3)

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Repository CRUD operations work
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/gateway/services/tenant-integration-repository.test.ts
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-8-repo-tests.txt

  Scenario: Build passes with new service
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-8-build-pass.txt
  ```

  **Commit**: YES (group with T8 solo or with T9-T11)
  - Message: `feat(tenants): add TenantIntegrationRepository for multi-provider integrations`
  - Files: `src/gateway/services/tenant-integration-repository.ts`, `tests/gateway/services/tenant-integration-repository.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Migrate TenantInstallationStore to use tenant_integrations

  **What to do**:
  - Refactor `src/gateway/slack/installation-store.ts`:
    - Inject `TenantIntegrationRepository` alongside existing repos
    - `fetchInstallation({ teamId })`: Query `tenant_integrations` where `provider='slack'` and `external_id=teamId` instead of `tenantRepo.findBySlackTeamId(teamId)`
    - `storeInstallation(installation)`: Upsert into `tenant_integrations` with `provider='slack'`, `external_id=teamId` instead of `tenantRepo.update(id, { slack_team_id: teamId })`
    - `deleteInstallation({ teamId })`: Delete the `tenant_integrations` row and clear the secret, instead of `tenantRepo.update(id, { slack_team_id: null })`
  - Update tests in `tests/gateway/slack/installation-store.test.ts`

  **Must NOT do**:
  - Do not remove `slack_team_id` from the Tenant model yet (Task 26)
  - Keep backward-compatible: during migration, ALSO write to `slack_team_id` on tenant for any code that still reads it

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 10-14)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 3, 8

  **References**:
  - `src/gateway/slack/installation-store.ts` — Current implementation using `tenantRepo.findBySlackTeamId()` and `tenantRepo.update(id, { slack_team_id })`
  - `src/gateway/services/tenant-integration-repository.ts` — New repo created in Task 8
  - `tests/gateway/slack/installation-store.test.ts` — Existing tests to update (lines 15, 164, 178 reference `slack_team_id`)

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Installation store tests pass with new repo
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/gateway/slack/installation-store.test.ts
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-9-installation-store-tests.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-9-build-pass.txt
  ```

  **Commit**: YES (group with T10, T11)
  - Message: `refactor(tenants): extract slack_team_id to tenant_integrations table`
  - Files: `src/gateway/slack/installation-store.ts`, `tests/gateway/slack/*`
  - Pre-commit: `pnpm test -- --run`

- [x] 10. Migrate slack-oauth.ts to use tenant_integrations

  **What to do**:
  - Refactor `src/gateway/routes/slack-oauth.ts`:
    - Line 129: Replace `where: { slack_team_id: teamId }` with query to `TenantIntegrationRepository.findByExternalId('slack', teamId)`
    - Line 136: Replace `data: { slack_team_id: teamId }` with `integrationRepo.upsert(tenantId, 'slack', { external_id: teamId })`
    - Inject `TenantIntegrationRepository` into the route factory
  - Update tests in `tests/gateway/routes/slack-oauth-install.test.ts`

  **Must NOT do**:
  - Do not change the OAuth flow logic — only change WHERE integration data is stored/read
  - Keep writing `slack_team_id` on tenant for backward compat (dual-write)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9, 11-14)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 3, 8

  **References**:
  - `src/gateway/routes/slack-oauth.ts:129,136` — Current code writing `slack_team_id` directly to tenant
  - `src/gateway/services/tenant-integration-repository.ts` — New repo (Task 8)
  - `tests/gateway/routes/slack-oauth-install.test.ts:14` — Test with `slack_team_id: null`

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: OAuth tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/gateway/routes/slack-oauth-install.test.ts
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-10-oauth-tests.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-10-build-pass.txt
  ```

  **Commit**: YES (group with T9, T11)
  - Message: `refactor(tenants): extract slack_team_id to tenant_integrations table`
  - Files: `src/gateway/routes/slack-oauth.ts`, `tests/gateway/routes/slack-oauth-install.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 11. Migrate scripts and remaining tenant-repository references

  **What to do**:
  - Update `src/gateway/services/tenant-repository.ts`: Remove `findBySlackTeamId` method and `slack_team_id` from the update interface. These are now handled by `TenantIntegrationRepository`.
  - Update `scripts/setup-two-tenants.ts`: Replace all `slack_team_id` references with calls to admin API or direct `tenant_integrations` writes
  - Update `scripts/verify-multi-tenancy.ts`: Read integration data from `tenant_integrations` instead of `tenants.slack_team_id`
  - Update all test files that reference `slack_team_id` on tenant objects:
    - `tests/gateway/services/tenant-env-loader.test.ts:12`
    - `tests/gateway/routes/admin-tenants.test.ts:16`
    - `tests/gateway/routes/admin-tenant-secrets.test.ts:16`
    - `tests/gateway/routes/admin-tenant-config.test.ts:15`
    - `tests/gateway/routes/slack-oauth-install.test.ts:14`
    - `tests/integration/multi-tenancy.test.ts:25`
    - `tests/gateway/services/tenant-repository.test.ts:58-60`

  **Must NOT do**:
  - Do not drop the `slack_team_id` column from the schema yet (Task 26)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T9, T10 complete)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 26
  - **Blocked By**: Tasks 9, 10

  **References**:
  - `src/gateway/services/tenant-repository.ts:7,41,59` — `slack_team_id` in interface + methods
  - `scripts/setup-two-tenants.ts:165-195` — Heavy use of `slack_team_id`
  - `scripts/verify-multi-tenancy.ts:216-241` — Verification using `slack_team_id`
  - All test files listed above

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass after migration
    Tool: Bash
    Steps:
      1. pnpm test -- --run
    Expected Result: 515+ tests pass
    Evidence: .sisyphus/evidence/task-11-all-tests.txt

  Scenario: No remaining slack_team_id reads from tenant-repository
    Tool: Bash (grep)
    Steps:
      1. grep "slack_team_id" src/gateway/services/tenant-repository.ts
    Expected Result: Zero lines (method removed)
    Evidence: .sisyphus/evidence/task-11-tenant-repo-clean.txt
  ```

  **Commit**: YES (group with T9, T10)
  - Message: `refactor(tenants): extract slack_team_id to tenant_integrations table`
  - Files: `src/gateway/services/tenant-repository.ts`, `scripts/*`, `tests/**`
  - Pre-commit: `pnpm test -- --run`

- [x] 12. Create shell tools for summarizer: src/worker-tools/slack/

  **What to do**:
  - Create directory `src/worker-tools/slack/`
  - Create `src/worker-tools/slack/read-channels.ts`:
    - Standalone script that reads environment variables: `SLACK_BOT_TOKEN`, channel IDs from argv
    - Imports from `src/lib/slack-client.ts` for API calls
    - Reads messages from specified channels for configurable lookback period
    - Filters out bot messages and Papi Chulo's own summaries (same logic as current `slack-read-channels.ts` tool)
    - Prints messages as JSON to stdout
    - Usage: `node /tools/slack/read-channels.js --channels "C123,C456" --lookback-hours 24`
  - Create `src/worker-tools/slack/post-message.ts`:
    - Standalone script that posts a message to a Slack channel
    - Reads `SLACK_BOT_TOKEN` from env, channel + text from argv
    - Prints `{ ts, channel }` to stdout on success
    - Usage: `node /tools/slack/post-message.js --channel "C123" --text "Hello" [--blocks '...']`
  - Update `Dockerfile` to compile these scripts and copy to `/tools/slack/` in the container
  - Write basic tests for each script

  **Must NOT do**:
  - Do not use MCP servers — shell scripts only
  - Do not import from the generic harness tools — fresh implementations importing from `src/lib/`
  - Do not add CLI framework dependencies — use basic `process.argv` parsing or minimal arg parser

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 5, 6 (model config must be settled)

  **References**:
  - `docs/2026-04-14-0104-full-system-vision.md:313-357` — Vision doc tool access model: shell commands, not MCP servers. Directory structure as discovery mechanism.
  - `src/workers/tools/slack-read-channels.ts` — Existing tool logic to port (channel reading, bot filtering, self-summary filtering via `block_id: 'papi-chulo-daily-summary'`)
  - `src/workers/tools/slack-post-message.ts` — Existing tool logic to port (message posting with blocks, approval buttons)
  - `src/lib/slack-client.ts` — Shared Slack client to import from
  - `Dockerfile` — Needs build step for worker-tools

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: read-channels script compiles and has correct interface
    Tool: Bash
    Steps:
      1. pnpm build
      2. ls dist/worker-tools/slack/read-channels.js
    Expected Result: File exists, build passes
    Evidence: .sisyphus/evidence/task-12-read-channels-build.txt

  Scenario: post-message script compiles and has correct interface
    Tool: Bash
    Steps:
      1. ls dist/worker-tools/slack/post-message.js
      2. node dist/worker-tools/slack/post-message.js --help 2>&1 || true
    Expected Result: File exists. Help output shows --channel and --text args.
    Evidence: .sisyphus/evidence/task-12-post-message-build.txt
  ```

  **Commit**: YES (group with T13)
  - Message: `feat(worker): create shell tools and OpenCode entry point for non-engineering employees`
  - Files: `src/worker-tools/slack/*`, `Dockerfile`
  - Pre-commit: `pnpm build`

- [x] 13. Create OpenCode worker entry point for non-engineering employees

  **What to do**:
  - Create `src/workers/opencode-harness.mts` — entry point for OpenCode-based non-engineering employees
  - Boot sequence:
    1. Read `TASK_ID` from env
    2. Fetch task + archetype from PostgREST (same as current generic harness)
    3. Create execution record
    4. Update task → Executing
    5. Start OpenCode session with:
       - System prompt from `archetype.system_prompt`
       - Task instructions from `archetype.instructions`
       - Model from `archetype.model` (MiniMax M2.7)
       - Available tools: shell scripts at `/tools/` + any `execution_tools` from archetype
    6. Monitor OpenCode session until completion
    7. Extract deliverable from OpenCode output
    8. Write deliverable record, fire Inngest event, update task → Submitting
  - Reuse OpenCode session management from existing `src/workers/lib/session-manager.ts`
  - Add SIGTERM handler (same pattern as generic harness)
  - CMD override: `["node", "/app/dist/workers/opencode-harness.mjs"]`

  **Must NOT do**:
  - Do not modify the existing engineering worker (`orchestrate.mts`) — it's deprecated
  - Do not import from generic harness tools — use shell tools from Task 12
  - Do not hardcode any employee-specific logic — behavior comes from archetype config

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Reason: Complex integration with OpenCode session management, PostgREST, and Inngest events

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 15, 16
  - **Blocked By**: Task 12

  **References**:
  - `src/workers/generic-harness.mts` — Current harness to replace. Reuse: PostgREST client setup, SIGTERM handler, execution record creation, deliverable writing, Inngest event firing patterns.
  - `src/workers/orchestrate.mts` — Engineering worker using OpenCode. Study how it creates sessions, injects prompts, monitors completion. Lines 261 for model config, session creation pattern.
  - `src/workers/lib/session-manager.ts` — OpenCode session management. `createSession()`, `promptAsync()`, `monitorCompletion()` patterns.
  - `src/workers/lib/postgrest-client.ts` — PostgREST client used by harness

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: OpenCode harness compiles
    Tool: Bash
    Steps:
      1. pnpm build
      2. ls dist/workers/opencode-harness.mjs
    Expected Result: File exists, build passes
    Evidence: .sisyphus/evidence/task-13-opencode-harness-build.txt

  Scenario: Harness exits cleanly without TASK_ID
    Tool: Bash
    Steps:
      1. node dist/workers/opencode-harness.mjs 2>&1 || echo "EXIT:$?"
    Expected Result: Logs error about missing TASK_ID, exits with code 1
    Evidence: .sisyphus/evidence/task-13-missing-taskid.txt
  ```

  **Commit**: YES (group with T12)
  - Message: `feat(worker): create shell tools and OpenCode entry point for non-engineering employees`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 14. Implement unified lifecycle state machine

  **What to do**:
  - Refactor `src/inngest/employee-lifecycle.ts` to implement the FULL vision state machine:
    - `Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done`
  - Each state is a separate `step.run()` call in the Inngest function
  - Auto-pass behavior controlled by archetype config:
    - `Triaging`: If archetype has `auto_triage: true` (or no triage logic defined) → auto-pass to Ready
    - `AwaitingInput`: If triage didn't need clarification → auto-pass
    - `Validating`: If archetype has no `validation_stages` → auto-pass
    - `Reviewing/AwaitingApproval`: If `risk_model.approval_required === false` → auto-pass
    - `Delivering`: State where post-approval work happens (Task 17 implements the machine spawn)
  - Each state transition logs a `task_status_log` entry
  - Keep the existing approval flow (waitForEvent, approve/reject handling) in the Reviewing state
  - Rename the function from current generic patterns to clearly universal: `employee/universal-lifecycle`

  **Must NOT do**:
  - Do not modify `src/inngest/lifecycle.ts` (engineering — deprecated)
  - Do not implement actual triage logic (just auto-pass)
  - Do not implement actual validation logic (just auto-pass for now)
  - Do not implement the Delivering machine spawn yet (Task 17)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Reason: Complex state machine with multiple Inngest steps, event handling, and status transitions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 16, 17
  - **Blocked By**: Task 4 (archetype instructions field)

  **References**:
  - `docs/2026-04-14-0104-full-system-vision.md:119-197` — Full state machine definition with all states, transitions, and per-employee behavior
  - `src/inngest/employee-lifecycle.ts` — Current implementation to refactor. Keep: Inngest function structure, PostgREST calls, approval event handling, machine provisioning, cleanup.
  - `src/inngest/employee-lifecycle.ts:32-40` — Task loading pattern
  - `src/inngest/employee-lifecycle.ts:145-160` — Approval event waiting pattern
  - `docs/2026-04-14-0104-full-system-vision.md:184` — "Every employee goes through every state. There are no 'simple' shortcuts"

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build passes with new lifecycle
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-14-build-pass.txt

  Scenario: All existing tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run
    Expected Result: 515+ tests pass (may need test updates for renamed function)
    Evidence: .sisyphus/evidence/task-14-tests-pass.txt

  Scenario: Lifecycle function has all states
    Tool: Bash (grep)
    Steps:
      1. grep -c "Triaging\|AwaitingInput\|Ready\|Executing\|Validating\|Submitting\|Reviewing\|Approved\|Delivering\|Done" src/inngest/employee-lifecycle.ts
    Expected Result: Count >= 10 (all states referenced)
    Evidence: .sisyphus/evidence/task-14-all-states.txt
  ```

  **Commit**: YES (solo)
  - Message: `refactor(lifecycle): implement unified state machine with all states`
  - Files: `src/inngest/employee-lifecycle.ts`, `tests/inngest/*`
  - Pre-commit: `pnpm test -- --run`

- [x] 15. Update archetype config: instructions + model

  **What to do**:
  - Update `prisma/seed.ts` to set the `instructions` field on the daily-summarizer archetype:
    ```
    instructions: "Read the last 24 hours of messages from the configured Slack channels (channel IDs are in the DAILY_SUMMARY_CHANNELS environment variable, comma-separated). Generate a dramatic Spanish news-style summary following your system prompt guidelines. Post the summary to the approval channel (SUMMARY_TARGET_CHANNEL environment variable) for human review. Include approve/reject buttons in the message. The task ID is available in the TASK_ID environment variable — include it in the button values for approval routing."
    ```
  - Change `runtime: 'generic-harness'` to `runtime: 'opencode'` in the archetype
  - Verify `model: 'minimax/minimax-m2.7'` is already set (from Task 6)
  - Update `tool_registry` to reference shell tools: `{ tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] }`
  - Run seed: `npx prisma db seed`

  **Must NOT do**:
  - Do not remove the `steps` field from seed yet — keep for reference but it won't be read by OpenCode harness
  - Do not modify the system prompt

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 16-21)
  - **Blocks**: Task 25
  - **Blocked By**: Tasks 4, 6, 13

  **References**:
  - `prisma/seed.ts:123-197` — Current archetype seed with deterministic steps
  - `prisma/schema.prisma` — Archetype model with `instructions` field (added in Task 4)

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs successfully with instructions
    Tool: Bash
    Steps:
      1. npx prisma db seed
    Expected Result: Seed completes without errors
    Evidence: .sisyphus/evidence/task-15-seed-success.txt

  Scenario: Archetype has instructions field set
    Tool: Bash (curl)
    Steps:
      1. curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "http://localhost:54321/rest/v1/archetypes?role_name=eq.daily-summarizer&select=instructions,runtime,model"
    Expected Result: Response contains non-null instructions, runtime='opencode', model='minimax/minimax-m2.7'
    Evidence: .sisyphus/evidence/task-15-archetype-check.txt
  ```

  **Commit**: YES (group with T16, T17)
  - Message: `feat(summarizer): wire OpenCode worker + post-approval delivery machine`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 16. Update lifecycle to spawn OpenCode worker

  **What to do**:
  - In the unified lifecycle (`src/inngest/employee-lifecycle.ts`), update the `dispatch-machine` step:
    - Check archetype `runtime` field: if `'opencode'` → use CMD `["node", "/app/dist/workers/opencode-harness.mjs"]`
    - If `runtime` is null or `'generic-harness'` → use existing CMD (backward compat during transition)
    - Pass the same env vars (tenant env, TASK_ID, SUPABASE_URL, SUPABASE_SECRET_KEY)
  - Update the worker Docker image reference to use the image that includes both the OpenCode harness and shell tools

  **Must NOT do**:
  - Do not delete the generic harness CMD path yet (backward compat — Task 26)
  - Do not hardcode employee-specific logic — runtime selection comes from archetype

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 17, 25
  - **Blocked By**: Tasks 13, 14

  **References**:
  - `src/inngest/employee-lifecycle.ts:49-86` — Current dispatch-machine step with CMD override
  - `src/workers/opencode-harness.mts` — New entry point (Task 13)
  - `src/inngest/lifecycle.ts:183-210` — Engineering lifecycle's machine dispatch (for reference on how it passes OpenCode env vars like OPENROUTER_MODEL)

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lifecycle references opencode harness
    Tool: Bash (grep)
    Steps:
      1. grep "opencode-harness" src/inngest/employee-lifecycle.ts
    Expected Result: At least 1 match (CMD reference)
    Evidence: .sisyphus/evidence/task-16-opencode-ref.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-16-build-pass.txt
  ```

  **Commit**: YES (group with T15, T17)
  - Message: `feat(summarizer): wire OpenCode worker + post-approval delivery machine`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 17. Post-approval: spawn delivery machine

  **What to do**:
  - In the unified lifecycle, refactor the `handle-result` step (currently lines 162-245):
    - Remove the inline Slack posting logic (lines 211-226 — direct `slackClient.postMessage`)
    - Instead, on approval: spawn a NEW Fly.io machine with the OpenCode harness
    - Pass delivery-specific env vars: `TASK_ID`, `DELIVERY_MODE=true`, deliverable content/metadata
    - The OpenCode harness detects `DELIVERY_MODE=true` and reads delivery instructions from the archetype
    - Add `delivery_instructions` to archetype or use a section in `instructions` like: "When in delivery mode, publish the approved content to the publish channel (SUMMARY_PUBLISH_CHANNEL)."
    - Poll the delivery machine for completion, then mark task Done
  - Keep the rejection flow inline (just update Slack message + mark Cancelled — no machine needed)
  - Keep the timeout/expiry flow inline

  **Must NOT do**:
  - Do not remove the existing inline publish as a fallback yet — add feature flag: `DELIVERY_MACHINE_ENABLED=true`
  - Do not change the approval button handling in `slack/handlers.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Reason: Complex flow: Inngest step → Fly.io machine → poll → state transition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 25
  - **Blocked By**: Tasks 14, 16

  **References**:
  - `src/inngest/employee-lifecycle.ts:162-245` — Current handle-result step with inline Slack posting
  - `src/inngest/employee-lifecycle.ts:49-86` — Machine creation pattern to reuse for delivery machine
  - `src/workers/opencode-harness.mts` — Must handle `DELIVERY_MODE=true` (Task 13 creates the entry point; this task adds delivery mode)

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lifecycle spawns delivery machine on approval
    Tool: Bash (grep)
    Steps:
      1. grep "DELIVERY_MODE\|delivery.machine\|delivery-machine" src/inngest/employee-lifecycle.ts
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-17-delivery-machine-ref.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-17-build-pass.txt
  ```

  **Commit**: YES (group with T15, T16)
  - Message: `feat(summarizer): wire OpenCode worker + post-approval delivery machine`
  - Files: `src/inngest/employee-lifecycle.ts`, `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 18. Register Bolt message event listener for thread replies

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, register a new event handler: `boltApp.event('message', ...)`
  - Filter for thread replies only: message must have `thread_ts` AND `thread_ts !== ts` (reply, not parent)
  - Filter out bot messages: ignore if `subtype === 'bot_message'` or `bot_id` is present
  - When a thread reply is detected:
    1. Check if `thread_ts` matches a known deliverable (query PostgREST: `deliverables?metadata->>approval_message_ts=eq.{thread_ts}` OR check published message ts)
    2. If match found: fire Inngest event `employee/feedback.received` with `{ taskId, feedbackText, userId, threadTs, channelId }`
    3. If no match: ignore (not a reply to an employee's deliverable)
  - Also need to subscribe to `message` events in the Slack app configuration (Socket Mode should already receive them if the app has the `channels:history` scope)

  **Must NOT do**:
  - Do not process the feedback yet (Task 19)
  - Do not respond to the thread yet (Task 22)
  - Do not handle @mentions here (Task 20)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 19, 20
  - **Blocked By**: None (but logically in Wave 3)

  **References**:
  - `src/gateway/slack/handlers.ts` — Current handlers for approve/reject buttons. Add message event handler here.
  - `src/gateway/server.ts:110-112` — Where `registerSlackHandlers(boltApp, inngest)` is called. The function needs to handle new event type.
  - Slack Bolt docs: `app.event('message', async ({ event }) => { ... })` pattern
  - `src/inngest/employee-lifecycle.ts:176-181` — How deliverables store `approval_message_ts` in metadata

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Message event handler registered
    Tool: Bash (grep)
    Steps:
      1. grep "event.*message\|boltApp.event" src/gateway/slack/handlers.ts
    Expected Result: At least 1 match for message event registration
    Evidence: .sisyphus/evidence/task-18-message-handler.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-18-build-pass.txt
  ```

  **Commit**: YES (group with T19-T22)
  - Message: `feat(feedback): bidirectional feedback pipeline with thread replies and @mentions`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 19. Create feedback ingestion service

  **What to do**:
  - Create `src/gateway/services/feedback-service.ts`:
    - `ingestThreadReply(data: { taskId, feedbackText, userId, threadTs, channelId, tenantId }): Promise<void>`
    - Stores raw feedback in the `feedback` table with:
      - `feedback_type: 'thread_reply'`
      - `original_decision`: the deliverable content (JSON)
      - `corrected_decision`: null (acknowledge-only, no correction)
      - `correction_reason`: the feedback text
      - `created_by`: userId
      - `tenant_id`: from task lookup
      - `task_id`: from the matched deliverable's task
  - Create an Inngest function `employee/feedback-handler` triggered by `employee/feedback.received`:
    1. Call `feedbackService.ingestThreadReply(event.data)`
    2. Fire `employee/feedback.stored` event (for Task 22 to respond)
  - Register the new function in the Inngest serve config
  - Write tests for the feedback service

  **Must NOT do**:
  - Do not respond to the thread yet (Task 22)
  - Do not summarize feedback yet (Task 23)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 22, 23
  - **Blocked By**: Task 18

  **References**:
  - `prisma/schema.prisma:140-158` — Feedback model with fields to populate
  - `src/inngest/employee-lifecycle.ts` — Pattern for Inngest function creation
  - `src/gateway/inngest/serve.ts` — Where to register new Inngest function

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback service tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/gateway/services/feedback-service.test.ts
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-19-feedback-tests.txt

  Scenario: Build passes with new Inngest function
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-19-build-pass.txt
  ```

  **Commit**: YES (group with T18, T20-T22)
  - Message: `feat(feedback): bidirectional feedback pipeline with thread replies and @mentions`
  - Files: `src/gateway/services/feedback-service.ts`, `src/inngest/feedback-handler.ts`, `tests/**`
  - Pre-commit: `pnpm build`

- [x] 20. Register Bolt app_mention event listener

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, register: `boltApp.event('app_mention', ...)`
  - When the bot is @mentioned:
    1. Extract the mention text (strip the `<@BOT_ID>` prefix)
    2. Determine if this is in a thread (has `thread_ts`) or a top-level message
    3. Fire Inngest event `employee/mention.received` with `{ text, userId, channelId, threadTs?, tenantId }`
  - Tenant resolution: use the Slack team ID from the event to look up tenant via `TenantIntegrationRepository.findByExternalId('slack', teamId)`
  - Need to ensure the Slack app has `app_mentions:read` scope

  **Must NOT do**:
  - Do not process the mention yet (Task 21)
  - Do not respond yet (Task 21)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 21
  - **Blocked By**: Task 18 (logical dependency — add both event listeners together)

  **References**:
  - `src/gateway/slack/handlers.ts` — Add app_mention handler alongside message handler
  - Slack Bolt docs: `app.event('app_mention', async ({ event }) => { ... })` pattern
  - `src/gateway/services/tenant-integration-repository.ts` — For tenant lookup by Slack team ID

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: app_mention handler registered
    Tool: Bash (grep)
    Steps:
      1. grep "app_mention" src/gateway/slack/handlers.ts
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-20-mention-handler.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-20-build-pass.txt
  ```

  **Commit**: YES (group with T18, T19, T21, T22)
  - Message: `feat(feedback): bidirectional feedback pipeline with thread replies and @mentions`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 21. Create @mention intent classifier and handler

  **What to do**:
  - Create `src/gateway/services/mention-handler.ts`:
    - `classifyAndHandle(data: { text, userId, channelId, threadTs?, tenantId }): Promise<void>`
    - Uses an inline Haiku 4.5 call (via `callLLM`) to classify the mention into one of:
      - `feedback`: "Your summaries should include more detail about decisions" → store as feedback
      - `teaching`: "Always include links to original messages" → store as general teaching in feedback table with `feedback_type: 'teaching'`
      - `question`: "When do you run?" → respond with information from archetype config
      - `task`: "Summarize #random for the last week" → log as unsupported for now (future: create a new task)
    - After classification, take appropriate action:
      - `feedback`/`teaching`: Store in feedback table + respond in thread acknowledging
      - `question`: Respond with helpful info (inline Haiku call)
      - `task`: Respond saying "I can't create tasks from mentions yet, but I've noted your request."
  - Create Inngest function `employee/mention-handler` triggered by `employee/mention.received`
  - Write tests with mocked LLM calls

  **Must NOT do**:
  - Do not create actual tasks from mentions (deferred)
  - Do not spawn Fly.io machines for mention handling — inline Haiku calls only
  - Do not use MiniMax for classification — Haiku 4.5 is the verifier/lightweight model

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Reason: LLM-based intent classification, multiple action paths, test mocking

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 27
  - **Blocked By**: Task 20

  **References**:
  - `docs/2026-04-14-0104-full-system-vision.md:441-450` — Vision doc @mention handling: "The employee receives the message and determines intent itself"
  - `src/lib/call-llm.ts` — Use `callLLM` with `model: 'anthropic/claude-haiku-4-5'` for classification
  - `src/gateway/services/feedback-service.ts` — Reuse for storing feedback/teaching

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mention handler tests pass (with mocked LLM)
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/gateway/services/mention-handler.test.ts
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-21-mention-tests.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-21-build-pass.txt
  ```

  **Commit**: YES (group with T18-T20, T22)
  - Message: `feat(feedback): bidirectional feedback pipeline with thread replies and @mentions`
  - Files: `src/gateway/services/mention-handler.ts`, `src/inngest/mention-handler.ts`, `tests/**`
  - Pre-commit: `pnpm test -- --run`

- [x] 22. Create feedback response function (inline Haiku call)

  **What to do**:
  - Create `src/inngest/feedback-responder.ts` — Inngest function triggered by `employee/feedback.stored`
  - On trigger:
    1. Load the original deliverable content and the feedback text from the event data
    2. Load the archetype's system prompt (to maintain the employee's personality in responses)
    3. Make an inline Haiku 4.5 call via `callLLM`:
       - System prompt: "You are {role_name}. A human has given you feedback on your work. Respond naturally in character. If the feedback is clear, acknowledge it warmly. If it's unclear, ask ONE specific clarifying question. Keep your response under 2 sentences. Respond in the same language as the feedback."
       - User prompt: "Your deliverable: {summary}. Human feedback: {feedbackText}"
    4. Post the LLM response as a reply in the same Slack thread (using `slackClient.postMessage` with `thread_ts`)
  - Use tenant-scoped bot token for posting (load via `loadTenantEnv`)
  - Register in Inngest serve config

  **Must NOT do**:
  - Do not spawn a Fly.io machine — this is an inline LLM call in the Inngest function
  - Do not use MiniMax for responses — use Haiku 4.5 (fast, cheap, sufficient for 1-2 sentence responses)
  - Do not take corrective action — acknowledge only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 23-27)
  - **Blocks**: Task 27
  - **Blocked By**: Tasks 5 (Haiku in pricing), 19 (feedback stored event)

  **References**:
  - `src/lib/call-llm.ts` — `callLLM({ model: 'anthropic/claude-haiku-4-5', ... })` for inline LLM call
  - `src/lib/slack-client.ts` — `postMessage({ channel, text, thread_ts })` for threaded reply
  - `src/gateway/services/tenant-env-loader.ts` — `loadTenantEnv()` for tenant-scoped bot token
  - `src/inngest/employee-lifecycle.ts:162-174` — Pattern for loading tenant env inside an Inngest step

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback responder function exists and builds
    Tool: Bash
    Steps:
      1. pnpm build
      2. grep "feedback-responder\|feedback.stored" src/inngest/feedback-responder.ts
    Expected Result: Build passes, file references the trigger event
    Evidence: .sisyphus/evidence/task-22-responder-build.txt

  Scenario: Uses Haiku model (not MiniMax)
    Tool: Bash (grep)
    Steps:
      1. grep "claude-haiku" src/inngest/feedback-responder.ts
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-22-haiku-model.txt
  ```

  **Commit**: YES (group with T18-T21)
  - Message: `feat(feedback): bidirectional feedback pipeline with thread replies and @mentions`
  - Files: `src/inngest/feedback-responder.ts`
  - Pre-commit: `pnpm build`

- [x] 23. Create periodic feedback summarization cron

  **What to do**:
  - Create `src/inngest/triggers/feedback-summarizer.ts` — Inngest cron function
  - Schedule: weekly (e.g., `0 0 * * 0` — Sunday midnight) — configurable
  - On trigger:
    1. For each active archetype with feedback in the last 7 days:
    2. Query `feedback` table for recent entries grouped by `archetype_id` (via task → archetype relation)
    3. Make a Haiku 4.5 call to summarize patterns:
       - "Summarize these feedback items into recurring themes. Output as a JSON array of `{ theme, frequency, representative_quote }`."
    4. Store the summarized feedback in `knowledge_bases` table with `archetype_id` and `source_config: { type: 'feedback_summary', period: '7d' }`
  - Register in Inngest serve config

  **Must NOT do**:
  - Do not implement pgvector/embeddings yet — just store as text in `source_config` JSONB
  - Do not implement retrieval yet (Task 24)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 24
  - **Blocked By**: Task 19

  **References**:
  - `src/inngest/triggers/daily-summarizer.ts` — Pattern for Inngest cron function (if it exists)
  - `prisma/schema.prisma:224-238` — KnowledgeBase model for storing summarized feedback
  - `prisma/schema.prisma:140-158` — Feedback model for querying
  - `docs/2026-04-14-0104-full-system-vision.md:460-466` — Vision doc feedback pipeline: Capture → Store → Summarize → Index → Inject

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cron function registered
    Tool: Bash (grep)
    Steps:
      1. grep "feedback.*summariz\|cron.*feedback" src/inngest/triggers/feedback-summarizer.ts
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-23-cron-registered.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-23-build-pass.txt
  ```

  **Commit**: YES (group with T24)
  - Message: `feat(feedback): periodic summarization and context injection`
  - Files: `src/inngest/triggers/feedback-summarizer.ts`
  - Pre-commit: `pnpm build`

- [x] 24. Create feedback injection at task start

  **What to do**:
  - Modify the unified lifecycle (`src/inngest/employee-lifecycle.ts`) at the Executing state:
    - Before spawning the Fly.io machine, query `knowledge_bases` for recent feedback summaries related to the archetype
    - Also query `feedback` table for the last 5-10 raw feedback items for this archetype
    - Format as a context block:
      ```
      Your recent feedback (last 30 days):
      - [Theme 1]: "[representative quote]" (N occurrences)
      - [Theme 2]: "[representative quote]" (M occurrences)
      Recent specific feedback:
      - [User]: "[feedback text]" (on [date])
      ```
    - Pass this context as an environment variable `FEEDBACK_CONTEXT` to the Fly.io machine
    - The OpenCode harness reads `FEEDBACK_CONTEXT` and includes it in the system prompt preamble
  - Update `src/workers/opencode-harness.mts` to read and inject `FEEDBACK_CONTEXT`

  **Must NOT do**:
  - Do not implement pgvector retrieval — simple SQL query is sufficient for now
  - Do not modify the archetype's system prompt permanently — feedback is injected at runtime only

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Reason: Touches lifecycle + worker harness + database queries, needs careful integration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 27
  - **Blocked By**: Task 23

  **References**:
  - `docs/2026-04-14-0104-full-system-vision.md:417-426` — Vision doc showing feedback injection format
  - `src/inngest/employee-lifecycle.ts` — Lifecycle where injection happens (Executing state)
  - `src/workers/opencode-harness.mts` — Harness that receives FEEDBACK_CONTEXT env var

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lifecycle queries feedback before execution
    Tool: Bash (grep)
    Steps:
      1. grep "FEEDBACK_CONTEXT\|feedback.*inject\|knowledge_bases" src/inngest/employee-lifecycle.ts
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-24-feedback-injection.txt

  Scenario: OpenCode harness reads FEEDBACK_CONTEXT
    Tool: Bash (grep)
    Steps:
      1. grep "FEEDBACK_CONTEXT" src/workers/opencode-harness.mts
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-24-harness-reads-feedback.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-24-build-pass.txt
  ```

  **Commit**: YES (group with T23)
  - Message: `feat(feedback): periodic summarization and context injection`
  - Files: `src/inngest/employee-lifecycle.ts`, `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 25. End-to-end: OpenCode summarizer full flow

  **What to do**:
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Start all services: `pnpm dev:start` (in tmux)
  - Run the seed: `npx prisma db seed`
  - Trigger the summarizer for DozalDevs:
    ```bash
    curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' "http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger"
    ```
  - Verify the full flow:
    1. Task created with status `Received`
    2. Task transitions through: Triaging (auto-pass) → AwaitingInput (auto-pass) → Ready → Executing
    3. Fly.io machine spawned with OpenCode harness
    4. OpenCode reads Slack channels, generates summary, posts to approval channel
    5. Task status: Submitting → Reviewing → AwaitingApproval
    6. Approve via Slack button
    7. Delivery machine spawned (post-approval)
    8. Summary published to publish channel
    9. Task status: Approved → Delivering → Done
  - Capture evidence at each step

  **Must NOT do**:
  - Do not skip any verification step
  - Do not mark as passing if any state transition is skipped

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Reason: Full E2E verification across multiple systems (Inngest, Fly.io, Slack, Supabase)

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential, depends on all prior tasks
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 15, 16, 17

  **References**:
  - `scripts/trigger-task.ts` — Existing E2E trigger script (for engineering). May need adaptation.
  - Admin API: `POST /admin/tenants/:tenantId/employees/:slug/trigger`
  - Supabase PostgREST: `GET /rest/v1/tasks?id=eq.{taskId}&select=status` for status verification

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full summarizer E2E flow
    Tool: Bash (curl) + tmux
    Preconditions: Services running, Docker image rebuilt, seed applied
    Steps:
      1. Trigger summarizer: curl POST to admin trigger endpoint
      2. Poll task status every 15s: curl GET task status
      3. Verify status transitions: Received → Triaging → Ready → Executing → Submitting → Reviewing → AwaitingApproval
      4. Approve via Slack (or send Inngest event directly)
      5. Verify delivery machine spawned
      6. Verify task reaches Done
    Expected Result: Task completes full lifecycle, summary published to correct channel
    Failure Indicators: Task stuck in any state for >5 minutes, status skips states, Fly.io machine fails to spawn
    Evidence: .sisyphus/evidence/task-25-e2e-flow.txt

  Scenario: Summary appears in publish channel
    Tool: Bash (curl)
    Steps:
      1. After task is Done, verify the summary was posted to SUMMARY_PUBLISH_CHANNEL via Slack API or check task deliverable
    Expected Result: Deliverable content exists and is non-empty
    Evidence: .sisyphus/evidence/task-25-summary-published.txt
  ```

  **Commit**: NO (verification only, no code changes)

- [x] 26. Cleanup: drop slack_team_id, delete generic harness + tools

  **What to do**:
  - Remove `slack_team_id` from the Tenant model in `prisma/schema.prisma`
  - Run migration: `npx prisma migrate dev --name drop-slack-team-id-from-tenants`
  - Delete the following files (generic harness is now replaced by OpenCode):
    - `src/workers/generic-harness.mts`
    - `src/workers/tools/registry.ts`
    - `src/workers/tools/llm-generate.ts`
    - `src/workers/tools/slack-read-channels.ts`
    - `src/workers/tools/slack-post-message.ts`
    - `src/workers/tools/param-resolver.ts`
    - `src/workers/tools/types.ts`
  - Remove `steps` field from Archetype model (it's replaced by `instructions`)
  - Update any remaining imports or references to deleted files
  - Run `pnpm build` and `pnpm test -- --run` to verify nothing breaks

  **Must NOT do**:
  - Do not delete `src/workers/orchestrate.mts` or engineering worker files (deprecated but kept)
  - Do not delete test files for the generic harness — mark them as skipped with a comment explaining the harness was replaced

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 11 (all slack_team_id refs migrated), 16 (lifecycle uses OpenCode)

  **References**:
  - `prisma/schema.prisma:346` — `slack_team_id` to remove
  - `prisma/schema.prisma:207` — `steps` to remove
  - `src/workers/generic-harness.mts` — Delete
  - `src/workers/tools/` — Delete entire directory
  - All test files referencing generic harness tools

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No slack_team_id in schema
    Tool: Bash (grep)
    Steps:
      1. grep "slack_team_id" prisma/schema.prisma
    Expected Result: Zero lines returned
    Evidence: .sisyphus/evidence/task-26-no-slack-team-id.txt

  Scenario: Generic harness files deleted
    Tool: Bash
    Steps:
      1. ls src/workers/generic-harness.mts 2>&1
      2. ls src/workers/tools/registry.ts 2>&1
    Expected Result: Both return "No such file or directory"
    Evidence: .sisyphus/evidence/task-26-files-deleted.txt

  Scenario: Build and tests pass after cleanup
    Tool: Bash
    Steps:
      1. pnpm build
      2. pnpm test -- --run
    Expected Result: Build passes, 515+ tests pass
    Evidence: .sisyphus/evidence/task-26-clean-build.txt
  ```

  **Commit**: YES
  - Message: `chore: remove generic harness, drop slack_team_id, cleanup deprecated code`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`, deleted files
  - Pre-commit: `pnpm test -- --run`

- [x] 27. Tests for all new components

  **What to do**:
  - Write/verify tests exist for ALL new components:
    - `tests/gateway/services/tenant-integration-repository.test.ts` (from Task 8)
    - `tests/gateway/services/feedback-service.test.ts` (from Task 19)
    - `tests/gateway/services/mention-handler.test.ts` (from Task 21)
    - `tests/inngest/employee-lifecycle.test.ts` — update existing tests for unified lifecycle, add tests for auto-pass states
    - `tests/inngest/feedback-handler.test.ts` — new
    - `tests/inngest/feedback-responder.test.ts` — new
    - `tests/inngest/mention-handler.test.ts` — new
    - `tests/gateway/slack/handlers.test.ts` — add tests for message event and app_mention handlers
  - Ensure all tests use approved models (minimax-m2.7, claude-haiku-4-5) in fixtures
  - Run full test suite: `pnpm test -- --run`
  - Verify total test count has increased from baseline (515+)

  **Must NOT do**:
  - Do not write tests that require live Slack/Fly.io connections — mock all external dependencies
  - Do not use unauthorized models in test fixtures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on all prior tasks being complete
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: All tasks 1-26

  **References**:
  - `tests/` — All existing test files for patterns
  - `tests/inngest/employee-lifecycle.test.ts` — Existing lifecycle tests to update/extend
  - `tests/gateway/slack/handlers.test.ts` — Existing handler tests to extend

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass including new ones
    Tool: Bash
    Steps:
      1. pnpm test -- --run
    Expected Result: Total tests > 515, 0 failures (excluding known pre-existing)
    Evidence: .sisyphus/evidence/task-27-full-test-results.txt

  Scenario: New test files exist
    Tool: Bash
    Steps:
      1. ls tests/gateway/services/feedback-service.test.ts tests/gateway/services/mention-handler.test.ts tests/inngest/feedback-handler.test.ts tests/inngest/feedback-responder.test.ts
    Expected Result: All files exist
    Evidence: .sisyphus/evidence/task-27-new-test-files.txt
  ```

  **Commit**: YES
  - Message: `test: add tests for feedback pipeline, unified lifecycle, and tenant integrations`
  - Files: `tests/**`
  - Pre-commit: `pnpm test -- --run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify NO references to claude-sonnet, claude-opus, gpt-4o in production code.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Trigger summarizer for DozalDevs tenant → verify OpenCode generates summary → verify approval flow → verify delivery machine publishes → verify thread reply feedback is captured and acknowledged. Test @mention. Test edge cases: no messages, invalid tenant, duplicate trigger. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group   | Message                                                                                    | Files                                                                                    | Pre-commit           |
| ------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------- |
| T1      | `docs: enforce LLM model constraints and deprecate engineering lifecycle in AGENTS.md`     | `AGENTS.md`                                                                              | `pnpm build`         |
| T2-T4   | `feat(schema): add timestamps to all tables, tenant_integrations, archetype instructions`  | `prisma/schema.prisma`, `prisma/migrations/*`                                            | `pnpm build`         |
| T5-T7   | `fix(models): enforce MiniMax M2.7 + Haiku 4.5 only, remove unauthorized model references` | `src/lib/call-llm.ts`, `src/workers/tools/llm-generate.ts`, `prisma/seed.ts`, `tests/**` | `pnpm test -- --run` |
| T8-T11  | `refactor(tenants): extract slack_team_id to tenant_integrations table`                    | `src/gateway/services/*`, `src/gateway/slack/*`, `src/gateway/routes/*`, `scripts/*`     | `pnpm test -- --run` |
| T12-T13 | `feat(worker): create shell tools and OpenCode entry point for non-engineering employees`  | `src/worker-tools/slack/*`, `src/workers/opencode-harness.mts`                           | `pnpm build`         |
| T14     | `refactor(lifecycle): implement unified state machine with all states`                     | `src/inngest/employee-lifecycle.ts`                                                      | `pnpm test -- --run` |
| T15-T17 | `feat(summarizer): wire OpenCode worker + post-approval delivery machine`                  | `prisma/seed.ts`, `src/inngest/employee-lifecycle.ts`                                    | `pnpm test -- --run` |
| T18-T22 | `feat(feedback): bidirectional feedback pipeline with thread replies and @mentions`        | `src/gateway/slack/*`, `src/gateway/services/*`, `src/inngest/*`                         | `pnpm test -- --run` |
| T23-T24 | `feat(feedback): periodic summarization and context injection`                             | `src/inngest/triggers/*`, `src/inngest/*`                                                | `pnpm test -- --run` |
| T25-T27 | `chore: e2e verification, cleanup generic harness, drop slack_team_id, add tests`          | various                                                                                  | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: zero errors
pnpm lint           # Expected: zero errors
pnpm test -- --run  # Expected: 515+ passing (existing) + new tests
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Summarizer works end-to-end with OpenCode
- [ ] Feedback pipeline captures and responds to thread replies
- [ ] @mentions classified and handled
- [ ] No unauthorized model references in codebase
- [ ] `slack_team_id` fully migrated to `tenant_integrations`
- [ ] All tables have `created_at` + `updated_at`
