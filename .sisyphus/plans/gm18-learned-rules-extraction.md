# GM-18: Learned Rules Extraction from Edits and Rejections

## TL;DR

> **Quick Summary**: Build the system that learns from PM corrections — when a PM edits a draft before approving or rejects with feedback, an LLM extracts a behavioral rule and proposes it for human confirmation via Slack. Confirmed rules are permanent; unconfirmed expire after 30 days.
>
> **Deliverables**:
>
> - Prisma migration: `learned_rules` table with entity-pattern scoping
> - Inngest function: `employee/rule-extractor` consuming `employee/rule.extract-requested`
> - Lifecycle hook: emit extraction event on `approved_with_edits`
> - Slack action handlers: `rule_confirm`, `rule_reject`, `rule_rephrase` (+ modal)
> - Thread reply routing for "What should I learn?" fallback
> - Expiry cron for 30-day proposed rule cleanup
> - Comprehensive automated tests + API verification
> - Story map update marking GM-18 complete
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (migration) → Task 3 (event types) → Task 4 (rule-extractor) → Task 7 (Slack handlers) → Task 10 (tests)

---

## Context

### Original Request

Implement GM-18 from the Phase 1 story map. The system should analyze edits and rejections, extract behavioral rules via LLM, propose them for confirmation via Slack interactive buttons (Confirm/Reject/Rephrase), and store confirmed rules. Test thoroughly with automated tests and API endpoint verification. Mark GM-18 as completed in the story map when done.

### Interview Summary

**Key Discussions**:

- Dependencies GM-05, GM-17, and PLAT-10 are ALL fully complete
- `employee/rule.extract-requested` event is already emitted by PLAT-10's interaction handler in 2 places (L138, L295 of `interaction-handler.ts`) but has **NO consumer** — GM-18 creates the consumer
- The lifecycle does NOT currently emit the event after edit-diff detection — need to add this at the approval handling step
- System uses `action: 'approve'` + `editedContent` field presence to distinguish edits from plain approvals (no separate `approved_with_edits` action string)

**Research Findings**:

- Approval flow: `guest_edit_modal` → `action: 'approve'` + `editedContent` → lifecycle patches deliverable content (L674-717)
- `archetypeId` and `tenantId` are both available in the lifecycle's outer scope (L70, L98)
- PostgREST grants auto-apply via `ALTER DEFAULT PRIVILEGES` — no manual grant needed
- Existing Slack patterns: Socket Mode ack trick, modal views, block kit with mandatory context block
- `callLLM` interface: `{ model, messages, taskType, taskId?, temperature? }` → `{ content, model, estimatedCostUsd }`
- Event payload divergence: two existing emitters use different shapes (rejection path has `content`, feedback path does not)

### Metis Review

**Identified Gaps** (addressed):

- **Event payload divergence**: Three emitters with incompatible payloads → normalized at emission time with explicit nullability
- **Line number sequencing**: `archetypeId` is available from `event.data` (L70), not from L719 fetch — safe to emit anywhere in the approval block
- **PostgREST grants**: Auto-applied via `ALTER DEFAULT PRIVILEGES` — no manual task needed
- **Missing columns**: `slack_ts` and `slack_channel` needed on `learned_rules` for thread reply capture (not in story map spec but required by feature)
- **Empty diff guard**: User edits but makes no changes → skip extraction
- **Null notification_channel**: Log warning and return early, don't throw
- **inngest-serve.test.ts**: Function count will change — update or document as pre-existing

---

## Work Objectives

### Core Objective

Create a learning pipeline that extracts concrete behavioral rules from PM corrections (edits before approval, rejection feedback, teaching thread replies), proposes them for human confirmation via Slack, and stores confirmed rules for future prompt injection.

### Concrete Deliverables

- `prisma/migrations/*_add_learned_rules/migration.sql` — new `learned_rules` table
- `prisma/schema.prisma` — `LearnedRule` model
- `src/inngest/rule-extractor.ts` — new Inngest function
- `src/inngest/triggers/learned-rules-expiry.ts` — expiry cron
- `src/inngest/employee-lifecycle.ts` — emit `employee/rule.extract-requested` on edit-diff
- `src/inngest/interaction-handler.ts` — normalize event payload for feedback/teaching path
- `src/gateway/slack/handlers.ts` — `rule_confirm`, `rule_reject`, `rule_rephrase` action handlers + `rule_rephrase_modal` view
- `src/gateway/inngest/serve.ts` — register new functions
- `tests/inngest/rule-extractor.test.ts` — comprehensive unit tests
- `tests/inngest/learned-rules-expiry.test.ts` — expiry cron tests
- `tests/gateway/slack/rule-handlers.test.ts` — Slack action handler tests
- `docs/2026-04-21-2202-phase1-story-map.md` — mark GM-18 acceptance criteria as `[x]`

### Definition of Done

- [ ] `pnpm prisma migrate deploy` succeeds
- [ ] `pnpm prisma db seed` runs without error
- [ ] `pnpm test -- --run` passes (no new failures beyond pre-existing 3)
- [ ] Rule extraction triggers on edit-diff and rejection feedback
- [ ] Slack buttons (Confirm/Reject/Rephrase) work via PostgREST
- [ ] Confirmed rules are permanent, proposed rules expire after 30 days
- [ ] All `learned_rules` operations are tenant-isolated
- [ ] GM-18 acceptance criteria in story map are marked `[x]`

### Must Have

- `learned_rules` table with all columns from AC + `slack_ts`/`slack_channel`
- LLM-based rule extraction using `anthropic/claude-haiku-4-5`
- Slack Confirm/Reject/Rephrase interactive buttons
- "What should I learn?" thread fallback when no rule extractable
- 30-day expiry for `proposed` rules (cron)
- Tenant isolation via `tenant_id` FK
- Automated tests covering happy path, fallback, edge cases

### Must NOT Have (Guardrails)

- **NO rule injection into future prompts** — that is a separate story (GM-19 scope)
- **NO `minimax/minimax-m2.7` for extraction** — must use `anthropic/claude-haiku-4-5` (judge/classification per AGENTS.md)
- **NO modifications to `src/inngest/lifecycle.ts`** (deprecated) — only `employee-lifecycle.ts`
- **NO manual PostgREST grants** — `ALTER DEFAULT PRIVILEGES` handles this automatically
- **NO rule versioning/history** — rephrase updates `rule_text` in-place
- **NO per-property rule scoping** — only archetype-level scope for now
- **NO admin API endpoints for rules** — read-only via PostgREST direct access
- **NO Slack DM for rule proposals** — channel-only
- **NO rule deduplication logic** — accept duplicates, let humans manage
- **NO modifications to `feedback-summarizer.ts`** for rule expiry — create separate cron
- **NO `Co-authored-by` or AI references in commits**

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, `pnpm test -- --run`)
- **Automated tests**: YES (tests-after — test files created after implementation)
- **Framework**: Vitest (existing project framework)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB/Migration**: Use Bash (psql) — verify table structure, insert/query rows
- **Inngest functions**: Use Bash (curl to Inngest dev server) — trigger events, verify function execution
- **Slack handlers**: Unit tests with mocked Bolt — verify action routing and PostgREST calls
- **API verification**: Use Bash (curl to PostgREST) — CRUD operations on `learned_rules`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Prisma migration + LearnedRule model [quick]
├── Task 2: Normalize interaction-handler event payloads [quick]
└── Task 3: Define unified event payload types [quick]

Wave 2 (After Wave 1 — core logic):
├── Task 4: Rule extractor Inngest function [deep]
├── Task 5: Lifecycle emit on edit-diff [quick]
└── Task 6: Learned rules expiry cron [unspecified-high]

Wave 3 (After Wave 2 — Slack integration):
├── Task 7: Slack Confirm/Reject/Rephrase handlers [unspecified-high]
├── Task 8: Register functions in serve.ts [quick]
└── Task 9: Thread reply routing for "What should I learn?" [unspecified-high]

Wave 4 (After Wave 3 — verification):
├── Task 10: Automated tests [deep]
├── Task 11: API endpoint verification [unspecified-high]
├── Task 12: Mark story map complete [quick]
└── Task 13: Notify completion [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On       | Blocks                |
| ---- | ---------------- | --------------------- |
| 1    | —                | 4, 5, 6, 7, 9, 10, 11 |
| 2    | —                | 4                     |
| 3    | —                | 4, 5, 6, 7            |
| 4    | 1, 2, 3          | 7, 9, 10, 11          |
| 5    | 1, 3             | 10, 11                |
| 6    | 1, 3             | 10, 11                |
| 7    | 3, 4             | 9, 10, 11             |
| 8    | 4, 6             | 10, 11                |
| 9    | 4, 7             | 10, 11                |
| 10   | 4, 5, 6, 7, 8, 9 | 12                    |
| 11   | 8, 10            | 12                    |
| 12   | 10, 11           | 13                    |
| 13   | 12               | —                     |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **3 tasks** — T4 → `deep`, T5 → `quick`, T6 → `unspecified-high`
- **Wave 3**: **3 tasks** — T7 → `unspecified-high`, T8 → `quick`, T9 → `unspecified-high`
- **Wave 4**: **4 tasks** — T10 → `deep`, T11 → `unspecified-high`, T12 → `quick`, T13 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma Migration — `learned_rules` Table

  **What to do**:
  - Add `LearnedRule` model to `prisma/schema.prisma` with these columns:
    - `id` (String, uuid PK, `@default(uuid())`)
    - `tenant_id` (String, uuid FK → `Tenant`, NOT NULL, `onDelete: Cascade`)
    - `entity_type` (String, nullable — values: `tenant`, `archetype`, `property`, `channel`)
    - `entity_id` (String, nullable — the ID of the entity this rule is scoped to)
    - `scope` (String — `common` or `entity`)
    - `rule_text` (String — the extracted rule text)
    - `source` (String — `edit_diff`, `rejection`, `manual`, `weekly_synthesis`)
    - `status` (String — `proposed`, `confirmed`, `rejected`)
    - `source_task_id` (String, nullable — NOT a FK, just a stored reference)
    - `slack_ts` (String, nullable — Slack message timestamp for thread reply capture)
    - `slack_channel` (String, nullable — Slack channel ID for thread reply capture)
    - `created_at` (DateTime, `@default(now())`)
    - `confirmed_at` (DateTime, nullable)
  - Add relation to `Tenant` model: `learned_rules LearnedRule[]`
  - Run `pnpm prisma migrate dev --name add_learned_rules` to create migration
  - Verify migration SQL includes the correct column types, FK constraint, and indexes
  - Run `pnpm prisma db seed` to confirm seed still works with new table
  - Do NOT add manual PostgREST grants — `ALTER DEFAULT PRIVILEGES` from migration `20260401210430_postgrest_grants` handles this automatically

  **Must NOT do**:
  - Do NOT add `source_task_id` as a real FK — it's intentionally text-only
  - Do NOT add to `knowledge_base_entries` — separate table, separate concern
  - Do NOT add unique constraints on `(tenant_id, rule_text)` — duplicates are acceptable

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change (schema.prisma) + migration generation — straightforward Prisma task
  - **Skills**: []
    - No special skills needed — standard Prisma migration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 9, 10, 11
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:250-266` — `KnowledgeBaseEntry` model uses the same entity pattern (`entity_type`, `entity_id`, `scope`) — follow this exact column naming convention
  - `prisma/schema.prisma:142-161` — `Feedback` model shows how to add `tenant_id` FK with cascade delete
  - `prisma/schema.prisma:233-248` — `KnowledgeBase` model shows archetype FK pattern

  **API/Type References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:905` — GM-18 acceptance criteria specify the exact table schema (but missing `slack_ts`/`slack_channel` — those are required additions)

  **External References**:
  - None needed — standard Prisma migration

  **WHY Each Reference Matters**:
  - `KnowledgeBaseEntry` model: Copy the `entity_type`/`entity_id`/`scope` pattern exactly so both tables have consistent entity-scoping conventions
  - `Feedback` model: Shows the correct way to add `tenant_id` FK with `@relation` and `onDelete: Cascade`
  - Story map: The authoritative source for required columns (plus the two additions)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration applies successfully
    Tool: Bash
    Preconditions: Database running at localhost:54322
    Steps:
      1. Run: pnpm prisma migrate deploy
      2. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d learned_rules"
      3. Assert: 13 columns present: id, tenant_id, entity_type, entity_id, scope, rule_text, source, status, source_task_id, slack_ts, slack_channel, created_at, confirmed_at
      4. Assert: tenant_id has FK constraint to tenants(id)
    Expected Result: Table exists with all columns and correct types
    Failure Indicators: psql output shows missing columns or FK
    Evidence: .sisyphus/evidence/task-1-migration-applied.txt

  Scenario: PostgREST access works without manual grants
    Tool: Bash (curl)
    Preconditions: Supabase services running
    Steps:
      1. Run: curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "http://localhost:54321/rest/v1/learned_rules?limit=1"
      2. Assert: Response is JSON array (empty `[]` is fine)
      3. Assert: HTTP status is 200 (not 404 or 401)
    Expected Result: PostgREST returns empty array, confirming table is accessible
    Failure Indicators: 404 (table not found) or 401 (no grants)
    Evidence: .sisyphus/evidence/task-1-postgrest-access.txt

  Scenario: Seed still runs after migration
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: Exit code 0
    Expected Result: Seed completes without error
    Failure Indicators: Non-zero exit code or Prisma error
    Evidence: .sisyphus/evidence/task-1-seed-runs.txt
  ```

  **Commit**: YES (group: 1)
  - Message: `feat(db): add learned_rules table with entity-pattern scoping`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*_add_learned_rules/migration.sql`
  - Pre-commit: `pnpm prisma migrate deploy && pnpm prisma db seed`

---

- [x] 2. Normalize Interaction Handler Event Payloads

  **What to do**:
  - In `src/inngest/interaction-handler.ts`, update the feedback/teaching event emission (L295-303) to include the missing fields that the rejection path (L138-148) already sends
  - The current feedback/teaching emission only sends: `{ tenantId, feedbackId, feedbackType, source }`
  - It must also send: `content` (the text), `taskId` (if available), `archetypeId` (if available from context)
  - Updated emission at L295-303 should be:
    ```typescript
    await step.sendEvent('emit-rule-extract', {
      name: 'employee/rule.extract-requested',
      data: {
        tenantId: context.tenantId,
        feedbackId: routeResult.feedbackId,
        feedbackType: intent,
        source,
        content: text,
        taskId: taskId ?? null,
        archetypeId: context.archetypeId ?? null,
      },
    });
    ```
  - Ensure `text` and `taskId` are in scope at that point (they are — `text` from L38 event data, `taskId` from L53)

  **Must NOT do**:
  - Do NOT change the rejection path emission (L138-148) — it already has the correct shape
  - Do NOT add any new logic — only add missing fields to the existing emission

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, ~5 line change — just adding fields to an existing object
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/interaction-handler.ts:138-148` — Rejection path emission with full payload (model to follow)
  - `src/inngest/interaction-handler.ts:294-303` — Current feedback/teaching emission (the code to modify)
  - `src/inngest/interaction-handler.ts:38` — Where `text` is extracted from event data
  - `src/inngest/interaction-handler.ts:53` — Where `taskId` is extracted from context

  **WHY Each Reference Matters**:
  - L138-148: This is the correct payload shape — the feedback path needs to match it
  - L294-303: The exact code to modify — add `content`, `taskId`, `archetypeId` fields
  - L38, L53: Confirms the variables are in scope at the emission point

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback/teaching emission includes all required fields
    Tool: Bash (grep)
    Preconditions: File modified
    Steps:
      1. Read src/inngest/interaction-handler.ts lines 294-310
      2. Assert: emission data object contains `content`, `taskId`, `archetypeId` fields
      3. Assert: `content` maps to `text` variable
      4. Assert: `taskId` uses `taskId ?? null` pattern
      5. Assert: `archetypeId` uses `context.archetypeId ?? null` pattern
    Expected Result: All 7 fields present: tenantId, feedbackId, feedbackType, source, content, taskId, archetypeId
    Failure Indicators: Missing content/taskId/archetypeId fields
    Evidence: .sisyphus/evidence/task-2-normalized-payload.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run: pnpm test -- --run tests/inngest/interaction-handler.test.ts tests/inngest/interaction-handler-rejection-feedback.test.ts
      2. Assert: All tests pass (no regressions)
    Expected Result: Existing interaction handler tests pass
    Failure Indicators: Test failures in interaction handler tests
    Evidence: .sisyphus/evidence/task-2-tests-pass.txt
  ```

  **Commit**: YES (group: 2)
  - Message: `feat(inngest): add rule-extractor function and event type normalization`
  - Files: `src/inngest/interaction-handler.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 3. Define Unified Event Payload Types

  **What to do**:
  - Create a shared type definition for the `employee/rule.extract-requested` event payload
  - This can live at the top of `src/inngest/rule-extractor.ts` (which Task 4 creates) OR in a shared location like `src/inngest/types.ts` if one exists. Check if there's an existing types file first.
  - Define the unified payload interface:
    ```typescript
    export interface RuleExtractRequestedPayload {
      tenantId: string;
      feedbackId: string | null;
      feedbackType: 'rejection_reason' | 'edit_diff' | 'feedback' | 'teaching';
      taskId: string | null;
      archetypeId: string | null;
      content: string | null; // raw text — null for feedback/teaching if only feedbackId sent
      originalContent?: string; // for edit_diff: the original draft
      editedContent?: string; // for edit_diff: the edited version
      source?: string; // 'thread_reply' | 'mention' — from interaction handler
    }
    ```
  - This type will be imported by: rule-extractor.ts (Task 4), employee-lifecycle.ts (Task 5), interaction-handler.ts (Task 2 already normalizes the shape)

  **Must NOT do**:
  - Do NOT create a complex event typing system — just one interface
  - Do NOT add Inngest generic event types — the project uses `any` for Inngest events (no typed event maps)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single type definition file — trivial
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/interaction-handler.ts:138-148` — Rejection path payload shape (one emitter)
  - `src/inngest/interaction-handler.ts:295-303` — Feedback/teaching path payload shape (second emitter)
  - `src/inngest/triggers/feedback-summarizer.ts:8-26` — Pattern for defining interfaces at top of Inngest function files

  **WHY Each Reference Matters**:
  - L138-148 and L295-303: The two existing emitter shapes that must be encompassed by the unified type
  - feedback-summarizer.ts: Shows the project convention for defining interfaces at the top of Inngest files

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Type definition is valid TypeScript
    Tool: Bash
    Preconditions: Type file created
    Steps:
      1. Run: npx tsc --noEmit src/inngest/rule-extractor.ts (or wherever the type lives)
      2. Assert: No type errors
    Expected Result: TypeScript compiles without errors
    Failure Indicators: Type errors in the interface definition
    Evidence: .sisyphus/evidence/task-3-type-check.txt
  ```

  **Commit**: YES (group: 2)
  - Message: `feat(inngest): add rule-extractor function and event type normalization`
  - Files: type definition file
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Rule Extractor Inngest Function

     **What to do**:
  - Create `src/inngest/rule-extractor.ts` with function `createRuleExtractorFunction(inngest: Inngest): InngestFunction.Any`
  - Triggered by `employee/rule.extract-requested` event
  - Function ID: `employee/rule-extractor`
  - Implementation steps: 1. **Step `load-context`**: Extract event payload. If `feedbackType === 'edit_diff'`, use `originalContent` and `editedContent` directly. If `feedbackType` is `rejection_reason`/`feedback`/`teaching` and `content` is null but `feedbackId` is present, fetch the feedback row from PostgREST (`/rest/v1/feedback?id=eq.${feedbackId}&select=correction_reason`) to get the text. 2. **Guard: empty content** — if content is null/empty after loading, log warning `'No content to analyze — skipping rule extraction'` and return early. Do NOT post "What should I learn?" for empty content. 3. **Guard: no diff on edit** — if `feedbackType === 'edit_diff'` and `originalContent === editedContent`, log info and return early. No extraction needed for identical content. 4. **Step `resolve-channel`**: Fetch archetype's `notification_channel` via PostgREST: `GET /rest/v1/archetypes?id=eq.${archetypeId}&select=notification_channel`. If `archetypeId` is null or `notification_channel` is empty/null, log warning and return early — do NOT throw. 5. **Step `resolve-slack-token`**: Fetch tenant's Slack bot token via PostgREST: `GET /rest/v1/tenant_secrets?tenant_id=eq.${tenantId}&key=eq.slack_bot_token&select=ciphertext,iv,auth_tag`. Decrypt using the `decryptSecret` function from `src/lib/encryption.ts`. 6. **Step `extract-rule`**: Call `callLLM` with: - `model: 'anthropic/claude-haiku-4-5'` - `taskType: 'review'` - System prompt: instruct the LLM to analyze the correction and extract a concrete, actionable behavioral rule. The prompt should ask it to return JSON: `{ "extractable": true, "rule": "Always include checkout time when mentioning property policies" }` or `{ "extractable": false }`. For edit-diffs, include both original and edited content. For rejection feedback, include the rejection reason text. - `temperature: 0` 7. Parse the LLM response as JSON. If parsing fails or `extractable === false`, go to fallback path. 8. **Happy path (rule extracted)**:
    a. **Step `store-proposed-rule`**: INSERT into `learned_rules` via PostgREST with: `tenant_id`, `entity_type: 'archetype'`, `entity_id: archetypeId`, `scope: 'entity'`, `rule_text: rule`, `source: feedbackType === 'edit_diff' ? 'edit_diff' : 'rejection'`, `status: 'proposed'`, `source_task_id: taskId`. Use `Prefer: return=representation` to get the inserted row's `id` back.
    b. **Step `post-rule-review`**: Post Slack message to `notification_channel` using Slack Web API (`chat.postMessage`) with block kit containing: header, rule text section, divider, actions block with Confirm/Reject/Rephrase buttons (each with `value: ruleId`), context block with `Rule \`${ruleId}\``.
c. **Step `store-slack-ref`**: PATCH the `learned_rules`row to store`slack_ts`and`slack_channel`from the Slack response.
    9. **Fallback path (no rule extracted)**:
       a. If there's a`taskId` and a known approval message thread (`approvalMsgTs` — from task metadata), post a thread reply asking: "What should I learn from this change? (Reply here — I'll record it.)"
    b. If no thread context, log info and skip — cannot ask the question without a conversation thread.

  **Must NOT do**:
  - Do NOT use `minimax/minimax-m2.7` — must use `anthropic/claude-haiku-4-5`
  - Do NOT inject rules into prompts — that's GM-19
  - Do NOT add rule deduplication logic
  - Do NOT modify `feedback-summarizer.ts`
  - Do NOT create a shell tool — this runs as an Inngest function, not in a Docker worker

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core business logic with multiple steps, LLM integration, PostgREST operations, Slack API, error handling, and two distinct code paths
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Tasks 5, 6 — but T4 is the critical path item)
  - **Blocks**: Tasks 7, 9, 10, 11
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/inngest/triggers/feedback-summarizer.ts:27-124` — Complete Inngest function pattern: `createFunction`, step structure, PostgREST headers, `callLLM` usage. Follow this file's structure exactly.
  - `src/inngest/interaction-handler.ts:138-148` — Event payload shape for rejection path (one of the inputs to this function)
  - `src/inngest/interaction-handler.ts:295-303` — Event payload shape for feedback/teaching path (another input)
  - `src/inngest/employee-lifecycle.ts:674-717` — How `editedContent` is handled in the approval flow (the source of edit-diff events)

  **API/Type References**:
  - `src/lib/call-llm.ts` — `callLLM({ model, messages, taskType, taskId?, temperature? })` → `{ content, model, estimatedCostUsd }` — the LLM calling interface
  - `src/lib/encryption.ts` — `decryptSecret({ ciphertext, iv, authTag })` — for decrypting tenant Slack bot token

  **Test References**:
  - `tests/inngest/interaction-handler.test.ts` — Pattern for testing Inngest functions with mocked steps, mocked `callLLM`, mocked PostgREST fetch

  **External References**:
  - Slack Block Kit: `https://api.slack.com/reference/block-kit/blocks` — actions block with buttons

  **WHY Each Reference Matters**:
  - `feedback-summarizer.ts`: The closest existing Inngest function pattern — same structure (cron/event → load data → call LLM → store results)
  - `call-llm.ts`: Must use this utility, not raw OpenRouter API calls
  - `encryption.ts`: Tenant Slack tokens are AES-256-GCM encrypted in `tenant_secrets`
  - `interaction-handler.ts:138-148` and `295-303`: The two existing event emission shapes — the function must handle both plus the new edit-diff shape

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — rule extracted from edit-diff
    Tool: Bash (curl to PostgREST)
    Preconditions: Inngest dev server running, Supabase running, learned_rules table exists
    Steps:
      1. INSERT a test rule via PostgREST: curl -X POST -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Prefer: return=representation" "http://localhost:54321/rest/v1/learned_rules" -d '{"tenant_id":"00000000-0000-0000-0000-000000000003","entity_type":"archetype","entity_id":"test","scope":"entity","rule_text":"Test rule","source":"edit_diff","status":"proposed","source_task_id":null}'
      2. Assert: Response contains `id` field (UUID)
      3. Assert: Response contains `status: "proposed"`
      4. Cleanup: DELETE the test row
    Expected Result: Row inserted successfully with all fields
    Failure Indicators: PostgREST returns error or missing fields
    Evidence: .sisyphus/evidence/task-4-happy-path-insert.txt

  Scenario: Guard — empty content returns early
    Tool: Unit test (in Task 10)
    Preconditions: Rule extractor function exists
    Steps:
      1. Call rule extractor with content: null
      2. Assert: callLLM NOT called
      3. Assert: PostgREST INSERT NOT called
      4. Assert: Function returns without error
    Expected Result: Early return, no LLM call, no DB write
    Failure Indicators: callLLM called with null content
    Evidence: .sisyphus/evidence/task-4-empty-content-guard.txt

  Scenario: Guard — identical edit content returns early
    Tool: Unit test (in Task 10)
    Preconditions: Rule extractor function exists
    Steps:
      1. Call rule extractor with feedbackType: 'edit_diff', originalContent: 'Hello', editedContent: 'Hello'
      2. Assert: callLLM NOT called
      3. Assert: Function returns without error
    Expected Result: Early return — no extraction needed for identical content
    Failure Indicators: LLM called despite identical content
    Evidence: .sisyphus/evidence/task-4-identical-edit-guard.txt

  Scenario: Guard — null notification_channel returns early
    Tool: Unit test (in Task 10)
    Preconditions: Rule extractor function exists
    Steps:
      1. Mock archetype PostgREST response with notification_channel: null
      2. Call rule extractor with valid content
      3. Assert: callLLM still called (extraction happens)
      4. Assert: Slack chat.postMessage NOT called
      5. Assert: Warning logged
    Expected Result: Extraction runs but Slack posting skipped gracefully
    Failure Indicators: Error thrown or Slack message attempted
    Evidence: .sisyphus/evidence/task-4-null-channel-guard.txt
  ```

  **Commit**: YES (group: 2)
  - Message: `feat(inngest): add rule-extractor function and event type normalization`
  - Files: `src/inngest/rule-extractor.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 5. Lifecycle Emit on Edit-Diff

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, inside the `handle-approval-result` step, after the `editedContent` block (after L717), add a `step.sendEvent` call to emit `employee/rule.extract-requested`
  - The emission should be placed INSIDE the `if (editedContent)` block, after the deliverable patch succeeds (or after the try/catch at L716)
  - The original draft content is available from `deliverable?.content` (the value BEFORE patching) — capture this BEFORE the patch call at L688
  - Variables in scope: `taskId` (L84 load-task), `tenantId` (L98), `archetypeId` (L70 from event.data), `editedContent` (L656), `deliverable?.content` (original draft from the deliverable row loaded earlier in the step)
  - Implementation:
    ```typescript
    // Inside if (editedContent) block, before the try block:
    const originalDraft = deliverable?.content as string | undefined;
    // ... existing patch code ...
    // After the try/catch (after L717), add:
    await step.sendEvent('emit-edit-diff-rule-extract', {
      name: 'employee/rule.extract-requested',
      data: {
        tenantId,
        feedbackId: null,
        feedbackType: 'edit_diff',
        taskId,
        archetypeId,
        content: null,
        originalContent: originalDraft ?? '',
        editedContent,
      },
    });
    ```
  - **CRITICAL**: The `step.sendEvent` must be OUTSIDE the try/catch block — it's a separate Inngest step, not part of the deliverable patch. If the deliverable patch fails, we still want to attempt rule extraction since we have the edit content.

  **Must NOT do**:
  - Do NOT modify `src/inngest/lifecycle.ts` (deprecated) — only `employee-lifecycle.ts`
  - Do NOT add rule extraction inline — just emit the event, let the rule-extractor function handle it
  - Do NOT block the approval flow — `step.sendEvent` is fire-and-forget

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: ~15 line addition to an existing file at a known location
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:674-717` — The `if (editedContent)` block where the emission goes. `deliverable?.content` is the original draft before patching.
  - `src/inngest/employee-lifecycle.ts:70` — `archetypeId` from `event.data`
  - `src/inngest/employee-lifecycle.ts:98` — `tenantId` from `taskData`
  - `src/inngest/interaction-handler.ts:138-148` — Pattern for `step.sendEvent` with the rule extract event

  **WHY Each Reference Matters**:
  - L674-717: Exact insertion point — must understand the try/catch structure to place the emission correctly
  - L70 and L98: Confirms `archetypeId` and `tenantId` are in scope at the insertion point
  - interaction-handler.ts L138: Shows the `step.sendEvent` pattern for this specific event

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Edit-diff emission is present in lifecycle code
    Tool: Bash (grep)
    Preconditions: File modified
    Steps:
      1. Search src/inngest/employee-lifecycle.ts for 'emit-edit-diff-rule-extract'
      2. Assert: step.sendEvent call found with name 'employee/rule.extract-requested'
      3. Assert: data includes feedbackType: 'edit_diff'
      4. Assert: data includes originalContent and editedContent fields
      5. Assert: emission is inside the if (editedContent) block
    Expected Result: Event emission present at correct location with correct payload
    Failure Indicators: Missing emission or wrong location
    Evidence: .sisyphus/evidence/task-5-lifecycle-emission.txt

  Scenario: Existing lifecycle tests still pass
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle.test.ts
      2. Assert: All tests pass
    Expected Result: No regressions in lifecycle tests
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-5-lifecycle-tests.txt
  ```

  **Commit**: YES (group: 2)
  - Message: `feat(inngest): add rule-extractor function and event type normalization`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 6. Learned Rules Expiry Cron

  **What to do**:
  - Create `src/inngest/triggers/learned-rules-expiry.ts` with function `createLearnedRulesExpiryTrigger(inngest: Inngest): InngestFunction.Any`
  - Cron schedule: `0 2 * * *` (daily at 2am UTC — off-peak, separate from feedback-summarizer's `0 0 * * 0`)
  - Function ID: `trigger/learned-rules-expiry`
  - Implementation:
    1. Connect to PostgREST
    2. Calculate 30-day cutoff: `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()`
    3. Find expired rules: `GET /rest/v1/learned_rules?status=eq.proposed&confirmed_at=is.null&created_at=lt.${cutoff}&select=id`
    4. For each expired rule: PATCH `status` to `'expired'` (do NOT delete — keep for audit)
    5. Log count of expired rules
  - **CRITICAL**: Filter must include `confirmed_at=is.null` — a rule that's been confirmed should NEVER be expired even if created > 30 days ago
  - **CRITICAL**: Use status `'expired'` (not DELETE) — preserves audit trail

  **Must NOT do**:
  - Do NOT modify `feedback-summarizer.ts` — create a separate cron function
  - Do NOT delete rows — set `status: 'expired'`
  - Do NOT touch `confirmed` rules

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New file with PostgREST queries and date math — straightforward but needs correct logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/inngest/triggers/feedback-summarizer.ts:27-124` — Complete cron function pattern: `createFunction` with `triggers: [{ cron: '...' }]`, PostgREST headers, step structure. Copy this structure exactly.

  **WHY Each Reference Matters**:
  - feedback-summarizer.ts: The canonical cron pattern in this codebase — identical structure needed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cron function is valid TypeScript
    Tool: Bash
    Preconditions: File created
    Steps:
      1. Run: npx tsc --noEmit src/inngest/triggers/learned-rules-expiry.ts
      2. Assert: No type errors
    Expected Result: Compiles cleanly
    Failure Indicators: Type errors
    Evidence: .sisyphus/evidence/task-6-type-check.txt

  Scenario: Expired proposed rules are marked expired (unit test in Task 10)
    Tool: Unit test
    Preconditions: Function exists
    Steps:
      1. Mock PostgREST GET to return: 2 proposed rules created 31 days ago + 1 confirmed rule created 40 days ago + 1 proposed rule created 20 days ago
      2. Assert: PATCH called for ONLY the 2 expired proposed rules
      3. Assert: PATCH sets status to 'expired'
      4. Assert: Confirmed rule NOT patched
      5. Assert: Recent proposed rule NOT patched
    Expected Result: Only proposed rules older than 30 days are expired
    Failure Indicators: Confirmed rules touched or recent rules expired
    Evidence: .sisyphus/evidence/task-6-expiry-logic.txt
  ```

  **Commit**: YES (group: 4)
  - Message: `feat(inngest): add learned-rules expiry cron`
  - Files: `src/inngest/triggers/learned-rules-expiry.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Slack Confirm/Reject/Rephrase Action Handlers

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, inside the `registerSlackHandlers` function, add three new action handlers and one view handler:

  **`rule_confirm` action handler**:
  1. Extract `ruleId` from `actionBody.actions[0]?.value`
  2. Extract `userId` and `userName` from `actionBody.user`
  3. Inline ack with `replace_original: true` showing "✅ Rule confirmed by <@userId>"
  4. PATCH `learned_rules` via PostgREST: `status: 'confirmed'`, `confirmed_at: new Date().toISOString()`
  5. Use ack pattern: `(ack as any)({ replace_original: true, blocks: [...] })` — Socket Mode envelope trick

  **`rule_reject` action handler**:
  1. Same extraction as confirm
  2. Inline ack showing "❌ Rule rejected by <@userId>"
  3. PATCH `learned_rules`: `status: 'rejected'`

  **`rule_rephrase` action handler**:
  1. Extract `ruleId` from `actionBody.actions[0]?.value`
  2. Plain `await ack()` (no replacement yet — modal coming)
  3. Fetch current `rule_text` from PostgREST: `GET /rest/v1/learned_rules?id=eq.${ruleId}&select=rule_text`
  4. Open modal with `client.views.open()`:
     - `callback_id: 'rule_rephrase_modal'`
     - `private_metadata: JSON.stringify({ ruleId })`
     - Single `plain_text_input` block pre-populated with current `rule_text`
     - Non-empty validation
     - Title: "Rephrase Rule"
     - Submit: "Save"

  **`rule_rephrase_modal` view handler**:
  1. `boltApp.view('rule_rephrase_modal', ...)`
  2. Extract `ruleId` from `view.private_metadata`
  3. Extract new text from the input block
  4. `await ack()` (close modal)
  5. PATCH `learned_rules`: update `rule_text` to new text (keep `status: 'proposed'`)
  6. Update the original Slack message (need `slack_ts` and `slack_channel` from the `learned_rules` row) with the new rule text and fresh Confirm/Reject/Rephrase buttons
  7. Use `client.chat.update()` to update the message in-place

  **PostgREST access from handlers**: Use raw fetch with `process.env.SUPABASE_URL` and `process.env.SUPABASE_SECRET_KEY` — same pattern as existing handlers (e.g., `isTaskAwaitingApproval` at L57-92).

  **Must NOT do**:
  - Do NOT modify the `feedback` table from these handlers — only `learned_rules`
  - Do NOT add `Co-authored-by` lines
  - Do NOT send Inngest events from confirm/reject — handle directly via PostgREST (simpler, fewer moving parts)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Four handlers with PostgREST calls, Slack API (modal + message update), error handling — moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Tasks 9, 10, 11
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:249-325` — `approve`/`reject` handler pattern: extraction, ack trick, PostgREST patch. Copy this structure for `rule_confirm`/`rule_reject`.
  - `src/gateway/slack/handlers.ts:486-620` — `guest_edit` modal pattern: `client.views.open()`, `private_metadata`, `boltApp.view()` submission handler. Copy this for `rule_rephrase` + `rule_rephrase_modal`.
  - `src/gateway/slack/handlers.ts:57-92` — `isTaskAwaitingApproval()` shows PostgREST fetch pattern from handlers
  - `src/gateway/slack/handlers.ts:622-770` — `guest_reject` modal pattern with text input validation

  **WHY Each Reference Matters**:
  - L249-325: The exact pattern for confirm/reject — ack trick, PostgREST PATCH, dedup
  - L486-620: Modal opening, private_metadata passing, view submission — the rephrase modal follows this exactly
  - L57-92: Shows how to make PostgREST calls from Slack handlers (env vars, headers)
  - L622-770: Text input validation in modal — ensure non-empty rule text on rephrase

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: rule_confirm handler updates DB correctly
    Tool: Unit test (in Task 10)
    Preconditions: Handler registered, PostgREST mocked
    Steps:
      1. Simulate action body with action_id: 'rule_confirm', value: '<test-uuid>'
      2. Assert: ack called with replace_original: true and "✅ Rule confirmed" text
      3. Assert: PostgREST PATCH called with status: 'confirmed' and confirmed_at set
      4. Assert: PATCH target is /rest/v1/learned_rules?id=eq.<test-uuid>
    Expected Result: DB updated, Slack message replaced
    Failure Indicators: Missing PATCH call or wrong status
    Evidence: .sisyphus/evidence/task-7-confirm-handler.txt

  Scenario: rule_reject handler updates DB correctly
    Tool: Unit test (in Task 10)
    Preconditions: Handler registered, PostgREST mocked
    Steps:
      1. Simulate action body with action_id: 'rule_reject', value: '<test-uuid>'
      2. Assert: ack called with "❌ Rule rejected" text
      3. Assert: PostgREST PATCH called with status: 'rejected'
    Expected Result: DB updated, Slack message replaced
    Failure Indicators: Missing PATCH or wrong status
    Evidence: .sisyphus/evidence/task-7-reject-handler.txt

  Scenario: rule_rephrase opens modal with current rule text
    Tool: Unit test (in Task 10)
    Preconditions: Handler registered, PostgREST mocked
    Steps:
      1. Mock PostgREST GET to return rule_text: 'Original rule text'
      2. Simulate action body with action_id: 'rule_rephrase', value: '<test-uuid>'
      3. Assert: client.views.open called with callback_id: 'rule_rephrase_modal'
      4. Assert: Modal contains plain_text_input pre-populated with 'Original rule text'
      5. Assert: private_metadata contains ruleId
    Expected Result: Modal opens with current rule text
    Failure Indicators: Modal not opened or wrong text
    Evidence: .sisyphus/evidence/task-7-rephrase-modal.txt

  Scenario: rule_rephrase_modal submission updates rule text
    Tool: Unit test (in Task 10)
    Preconditions: View handler registered, PostgREST mocked
    Steps:
      1. Simulate view submission with private_metadata: {ruleId: '<uuid>'}, input value: 'Rephrased rule text'
      2. Assert: PostgREST PATCH called with rule_text: 'Rephrased rule text'
      3. Assert: status remains 'proposed' (not confirmed)
      4. Assert: client.chat.update called with updated blocks containing new text
    Expected Result: Rule text updated, message refreshed, status unchanged
    Failure Indicators: Status changed to confirmed or message not updated
    Evidence: .sisyphus/evidence/task-7-rephrase-submit.txt
  ```

  **Commit**: YES (group: 3)
  - Message: `feat(slack): add confirm/reject/rephrase handlers for learned rules`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 8. Register Functions in serve.ts

  **What to do**:
  - In `src/gateway/inngest/serve.ts`:
    1. Import `createRuleExtractorFunction` from `../../inngest/rule-extractor.js`
    2. Import `createLearnedRulesExpiryTrigger` from `../../inngest/triggers/learned-rules-expiry.js`
    3. Create function instances: `const ruleExtractorFn = createRuleExtractorFunction(inngest)` and `const learnedRulesExpiryFn = createLearnedRulesExpiryTrigger(inngest)`
    4. Add both to the `functions` array in the `serve()` call (after `unrespondedAlertFn`)
  - Current function count is 9 (L40-49). New count will be 11.

  **Must NOT do**:
  - Do NOT remove or reorder existing functions
  - Do NOT modify the existing `inngest-serve.test.ts` — it's already a pre-existing failure

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 6 line change — 2 imports + 2 instantiations + 2 array entries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Tasks 7, 9)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 4, 6

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts:1-56` — Full file showing import pattern, instantiation pattern, and functions array. Follow the existing convention exactly.

  **WHY Each Reference Matters**:
  - This is a small, mechanical change — the entire file is the reference. Follow exact import path convention (`.js` extension, `../../` prefix).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Functions are registered in serve.ts
    Tool: Bash (grep)
    Preconditions: File modified
    Steps:
      1. Grep for 'createRuleExtractorFunction' in src/gateway/inngest/serve.ts
      2. Grep for 'createLearnedRulesExpiryTrigger' in src/gateway/inngest/serve.ts
      3. Assert: Both imports present
      4. Assert: Both function instances created
      5. Assert: Both appear in the functions array
    Expected Result: Two new functions registered
    Failure Indicators: Missing import or array entry
    Evidence: .sisyphus/evidence/task-8-serve-registration.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run: npx tsc --noEmit
      2. Assert: No new errors in serve.ts
    Expected Result: Clean compilation
    Failure Indicators: Import path errors or type mismatches
    Evidence: .sisyphus/evidence/task-8-type-check.txt
  ```

  **Commit**: YES (group: 2 — same commit as rule-extractor)
  - Message: `feat(inngest): add rule-extractor function and event type normalization`
  - Files: `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 9. Thread Reply Routing for "What Should I Learn?"

  **What to do**:
  - When the rule-extractor posts "What should I learn?" as a thread reply (Task 4 fallback path), subsequent replies from team members need to be captured and turned into proposed rules
  - The existing `message` event handler in `src/gateway/slack/handlers.ts` (L165-202) already captures thread replies and routes them to `employee/interaction.received`
  - The interaction handler (`src/inngest/interaction-handler.ts`) already has rejection feedback detection that checks `task.metadata.rejection_feedback_requested`
  - **Approach**: Store a flag in `task.metadata` (or create a new lightweight tracking mechanism) when the "What should I learn?" message is posted. When a subsequent thread reply comes from a user (not bot), check if there's a pending "what should I learn?" question for that thread. If yes, create a `proposed` rule from the reply text.
  - Implementation options (pick the simplest):
    - **Option A**: In the rule-extractor (Task 4), after posting "What should I learn?", store a record in `learned_rules` with `status: 'awaiting_input'`, `slack_ts` set to the "What should I learn?" message ts, and `rule_text` empty. In the interaction handler, when a thread reply comes in and the task has an `awaiting_input` learned rule, update the rule's `rule_text` with the reply text, set `status: 'proposed'`, and post Confirm/Reject/Rephrase buttons.
    - **Option B**: Use task `metadata.rule_feedback_requested: true` similar to `rejection_feedback_requested` pattern. When a reply arrives, the interaction handler stores it as a proposed rule.
  - **Recommended**: Option A — keeps all state in `learned_rules` table, avoids polluting task metadata further
  - In `src/inngest/interaction-handler.ts`, add a check early in the flow (before intent classification): query `learned_rules?slack_channel=eq.${channelId}&status=eq.awaiting_input&slack_ts=eq.${threadTs}`. If found, update the row with the reply text and emit `employee/rule.extract-requested` with `feedbackType: 'manual'` (the reply IS the rule, no extraction needed — just propose it).

  **Must NOT do**:
  - Do NOT create a separate Inngest function for this — handle in the interaction handler
  - Do NOT add complex thread tracking — just check `learned_rules` for `awaiting_input` status

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires changes to two files (interaction-handler + rule-extractor), thread reply matching logic, PostgREST queries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 4, 7

  **References**:

  **Pattern References**:
  - `src/inngest/interaction-handler.ts:65-152` — Rejection feedback detection pattern: checks metadata flags, stores feedback, emits events. This is the EXACT pattern to follow for "awaiting_input" rule detection.
  - `src/gateway/slack/handlers.ts:165-202` — Thread reply capture: how `thread_ts` is extracted, how `findTaskIdByThreadTs` works
  - `src/inngest/interaction-handler.ts:295-303` — Event emission pattern for rule extraction

  **WHY Each Reference Matters**:
  - interaction-handler.ts L65-152: Shows the pattern of detecting a specific thread reply type (rejection feedback) and routing it specially before the generic intent classification. The "awaiting_input" check should go here.
  - handlers.ts L165-202: Shows how thread_ts is available in the interaction event data

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Thread reply on "What should I learn?" creates proposed rule
    Tool: Unit test (in Task 10)
    Preconditions: Interaction handler modified, PostgREST mocked
    Steps:
      1. Mock PostgREST GET for learned_rules with status: 'awaiting_input' matching thread_ts
      2. Simulate interaction event with thread reply text: "Always mention check-in time"
      3. Assert: PostgREST PATCH called on the learned_rules row with rule_text: "Always mention check-in time" and status: 'proposed'
      4. Assert: Slack message posted with Confirm/Reject/Rephrase buttons for the new rule
    Expected Result: Thread reply captured as proposed rule
    Failure Indicators: Rule not created or wrong status
    Evidence: .sisyphus/evidence/task-9-thread-reply-capture.txt

  Scenario: Thread reply with no awaiting_input rule falls through to normal flow
    Tool: Unit test (in Task 10)
    Preconditions: Interaction handler modified
    Steps:
      1. Mock PostgREST GET for learned_rules returning empty array (no awaiting_input rules)
      2. Simulate interaction event with thread reply
      3. Assert: Normal intent classification proceeds (callLLM for classification called)
    Expected Result: Normal flow — no short-circuit
    Failure Indicators: Interaction handler errors or skips classification
    Evidence: .sisyphus/evidence/task-9-normal-flow.txt
  ```

  **Commit**: YES (group: 2 — included in rule-extractor commit)
  - Message: `feat(inngest): add rule-extractor function and event type normalization`
  - Files: `src/inngest/interaction-handler.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 10. Automated Tests

  **What to do**:
  - Create comprehensive test files following existing patterns:

  **`tests/inngest/rule-extractor.test.ts`** — Test the core rule extractor function:
  - Test setup: mock `callLLM`, mock `fetch` (PostgREST), mock Slack `chat.postMessage`
  - Tests:
    1. **Happy path: edit-diff** — LLM returns extractable rule → rule inserted as proposed → Slack message posted with 3 buttons → slack_ts stored
    2. **Happy path: rejection feedback** — content from event → same flow as above
    3. **Happy path: feedback/teaching with feedbackId** — fetches content from feedback table → extraction
    4. **Fallback: no rule extractable** — LLM returns `extractable: false` → no DB insert → thread reply "What should I learn?"
    5. **Guard: empty content** — returns early, no LLM call
    6. **Guard: identical edit** — originalContent === editedContent → returns early
    7. **Guard: null notification_channel** — extraction runs but Slack post skipped
    8. **Guard: null archetypeId** — returns early with warning
    9. **LLM returns invalid JSON** — treated as "no rule extractable" → fallback path
    10. **Model enforcement** — assert `callLLM` called with `model: 'anthropic/claude-haiku-4-5'`

  **`tests/inngest/learned-rules-expiry.test.ts`** — Test the expiry cron:
  - Tests:
    1. **Proposed rules older than 30 days expired** — PATCH status to 'expired'
    2. **Confirmed rules NEVER expired** — even if > 30 days old
    3. **Recent proposed rules untouched** — < 30 days old
    4. **No rules to expire** — function completes without error
    5. **Already expired rules not re-processed** — filter: `status=eq.proposed`

  **`tests/gateway/slack/rule-handlers.test.ts`** — Test Slack action handlers:
  - Tests:
    1. **rule_confirm** — ack with ✅ message, PATCH status: confirmed + confirmed_at
    2. **rule_reject** — ack with ❌ message, PATCH status: rejected
    3. **rule_rephrase** — fetches current text, opens modal with pre-populated input
    4. **rule_rephrase_modal submission** — PATCH rule_text, update Slack message
    5. **Missing ruleId** — handler returns early without error

  - Follow test patterns from:
    - `tests/inngest/interaction-handler.test.ts` — Inngest function testing with mocked steps
    - `tests/inngest/interaction-handler-rejection-feedback.test.ts` — PostgREST mock pattern
    - `tests/gateway/` — handler testing patterns

  **Must NOT do**:
  - Do NOT modify pre-existing failing tests (`container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`)
  - Do NOT use real LLM calls in tests — mock `callLLM`
  - Do NOT use real Slack API — mock all Slack interactions

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 3 test files, 20+ test cases, comprehensive mocking, edge cases — requires careful thought
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Tasks 11, 12, 13)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5, 6, 7, 8, 9

  **References**:

  **Pattern References**:
  - `tests/inngest/interaction-handler.test.ts` — Inngest function testing: mock setup, step.run/step.sendEvent assertions, PostgREST mock responses
  - `tests/inngest/interaction-handler-rejection-feedback.test.ts` — PostgREST mock pattern for feedback operations, event emission assertions
  - `tests/inngest/employee-lifecycle.test.ts` — Lifecycle step testing pattern

  **WHY Each Reference Matters**:
  - interaction-handler tests: The closest pattern for testing an Inngest function that calls LLM + PostgREST + Slack. Copy the mock setup exactly.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: All test files created
    Steps:
      1. Run: pnpm test -- --run tests/inngest/rule-extractor.test.ts tests/inngest/learned-rules-expiry.test.ts tests/gateway/slack/rule-handlers.test.ts
      2. Assert: All tests pass (0 failures)
      3. Run: pnpm test -- --run
      4. Assert: No new failures beyond pre-existing 3
    Expected Result: All new tests pass, no regressions
    Failure Indicators: Test failures in new or existing tests
    Evidence: .sisyphus/evidence/task-10-tests-pass.txt

  Scenario: Test coverage covers critical paths
    Tool: Bash (grep)
    Preconditions: Test files exist
    Steps:
      1. Count test cases in rule-extractor.test.ts: grep -c "it(" or "test("
      2. Count test cases in learned-rules-expiry.test.ts
      3. Count test cases in rule-handlers.test.ts
      4. Assert: rule-extractor >= 8 tests, expiry >= 4 tests, handlers >= 4 tests
    Expected Result: >= 16 total test cases
    Failure Indicators: Fewer than minimum test cases
    Evidence: .sisyphus/evidence/task-10-test-count.txt
  ```

  **Commit**: YES (group: 5)
  - Message: `test(inngest): add comprehensive tests for rule extraction pipeline`
  - Files: `tests/inngest/rule-extractor.test.ts`, `tests/inngest/learned-rules-expiry.test.ts`, `tests/gateway/slack/rule-handlers.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 11. API Endpoint Verification

  **What to do**:
  - With services running (`pnpm dev:start`), verify the system works end-to-end:
  1. **Verify Inngest functions are registered**:

     ```bash
     curl -s http://localhost:8288/v0/fns | jq '[.[] | select(.id | contains("rule"))] | .[].id'
     ```

     Expected: `employee/rule-extractor` and `trigger/learned-rules-expiry`

  2. **Verify PostgREST CRUD on learned_rules**:

     ```bash
     # INSERT
     curl -s -X POST -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Prefer: return=representation" "http://localhost:54321/rest/v1/learned_rules" -d '{"tenant_id":"00000000-0000-0000-0000-000000000003","entity_type":"archetype","entity_id":"test","scope":"entity","rule_text":"Always mention checkout time","source":"edit_diff","status":"proposed"}'
     # Assert: 201 with id field

     # SELECT
     curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "http://localhost:54321/rest/v1/learned_rules?status=eq.proposed&select=id,rule_text,status"
     # Assert: Returns the inserted row

     # PATCH (confirm)
     curl -s -X PATCH -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" "http://localhost:54321/rest/v1/learned_rules?id=eq.<id>" -d '{"status":"confirmed","confirmed_at":"2026-04-29T00:00:00Z"}'
     # Assert: 204 or 200

     # DELETE (cleanup)
     curl -s -X DELETE -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "http://localhost:54321/rest/v1/learned_rules?id=eq.<id>"
     ```

  3. **Verify tenant isolation**:

     ```bash
     # INSERT with VLRE tenant
     curl -s -X POST ... -d '{"tenant_id":"00000000-0000-0000-0000-000000000003","rule_text":"VLRE rule",...}'
     # INSERT with DozalDevs tenant
     curl -s -X POST ... -d '{"tenant_id":"00000000-0000-0000-0000-000000000002","rule_text":"DozalDevs rule",...}'
     # SELECT filtered by tenant
     curl ... "http://localhost:54321/rest/v1/learned_rules?tenant_id=eq.00000000-0000-0000-0000-000000000003"
     # Assert: Only VLRE rule returned
     ```

  4. **Verify seed still runs**:

     ```bash
     pnpm prisma db seed
     # Assert: exit 0
     ```

  5. **Verify all tests pass**:
     ```bash
     pnpm test -- --run
     # Assert: no new failures
     ```

  **Must NOT do**:
  - Do NOT test the actual LLM extraction end-to-end (that would cost real API credits and need Slack running)
  - Do NOT modify any source code in this task

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple verification steps, curl commands, assertion checking
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 12, 13 — but depends on Task 10 completing first)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 8, 10

  **References**:

  **Pattern References**:
  - `scripts/verify-e2e.ts` — Shows the project's verification script pattern with assertions

  **WHY Each Reference Matters**:
  - verify-e2e.ts: The project's established way of doing post-implementation verification

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full API verification suite passes
    Tool: Bash (curl)
    Preconditions: Services running (gateway + Inngest + Supabase)
    Steps:
      1. Verify Inngest registration (2 new functions)
      2. Verify PostgREST INSERT/SELECT/PATCH/DELETE cycle
      3. Verify tenant isolation
      4. Verify seed runs
      5. Verify tests pass
    Expected Result: All 5 verification checks pass
    Failure Indicators: Any step returns unexpected result
    Evidence: .sisyphus/evidence/task-11-api-verification.txt
  ```

  **Commit**: NO (verification only — no code changes)

---

- [x] 12. Mark Story Map Complete

  **What to do**:
  - In `docs/2026-04-21-2202-phase1-story-map.md`, find the GM-18 acceptance criteria section (around L902-912)
  - Change all `- [ ]` checkboxes to `- [x]` for each acceptance criterion
  - The criteria to mark:
    - `[x] Prisma migration adds learned_rules table...`
    - `[x] On approved_with_edits: LLM analyzes diff...`
    - `[x] If concrete rule extracted: post to Slack with rule text + [Confirm] [Reject] [Rephrase] buttons`
    - `[x] If no concrete rule extractable: post thread reply asking "What should I learn from this change?"`
    - `[x] Team member's reply becomes the rule text with status: proposed and Confirm/Reject buttons`
    - `[x] status: confirmed rules are permanent...`
    - `[x] status: proposed rules expire after 30 days if never confirmed`
    - `[x] On rejection with feedback (from GM-17): same extraction pipeline runs on the rejection reason`
    - `[x] Rules are tenant-isolated: tenant_id is a real FK`
    - `[x] pnpm prisma db seed runs without error`
    - `[x] pnpm test -- --run passes`

  **Must NOT do**:
  - Do NOT mark any OTHER story's criteria as complete
  - Do NOT modify any other content in the story map

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Find-and-replace checkboxes in a single markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 11, 13)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 10, 11

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:902-912` — The exact lines to modify (GM-18 acceptance criteria)

  **WHY Each Reference Matters**:
  - The exact file and line range where checkboxes need to be toggled

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All GM-18 acceptance criteria marked complete
    Tool: Bash (grep)
    Preconditions: File modified
    Steps:
      1. Run: grep -A 15 "GM-18" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \[ \]"
      2. Assert: Output is empty (no unchecked boxes under GM-18)
      3. Run: grep -A 15 "GM-18" docs/2026-04-21-2202-phase1-story-map.md | grep -c "\- \[x\]"
      4. Assert: Count >= 11 (all criteria checked)
    Expected Result: All GM-18 criteria are marked [x]
    Failure Indicators: Any criteria still showing [ ]
    Evidence: .sisyphus/evidence/task-12-story-map-updated.txt
  ```

  **Commit**: YES (group: 6)
  - Message: `docs(story-map): mark GM-18 acceptance criteria as complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

- [x] 13. Notify Completion

  **What to do**:
  - Send Telegram notification that GM-18 implementation is complete:
    ```bash
    tsx scripts/telegram-notify.ts "✅ gm18-learned-rules-extraction complete — All tasks done. Come back to review results."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 12)
  - **Blocks**: None
  - **Blocked By**: Task 12

  **References**:
  - `scripts/telegram-notify.ts` — The notification script

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ gm18-learned-rules-extraction complete — All tasks done. Come back to review results."
      2. Assert: Exit code 0
    Expected Result: Notification delivered
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-13-notification-sent.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (rule extraction → Slack buttons → confirm/reject → DB state). Test edge cases: empty edit, null notification_channel, expired rules. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                   | Files                                                                       | Pre-commit                   |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| 1      | `feat(db): add learned_rules table with entity-pattern scoping`           | migration.sql, schema.prisma                                                | `pnpm prisma migrate deploy` |
| 2      | `feat(inngest): add rule-extractor function and event type normalization` | rule-extractor.ts, interaction-handler.ts, employee-lifecycle.ts, serve.ts  | `pnpm test -- --run`         |
| 3      | `feat(slack): add confirm/reject/rephrase handlers for learned rules`     | handlers.ts                                                                 | `pnpm test -- --run`         |
| 4      | `feat(inngest): add learned-rules expiry cron`                            | learned-rules-expiry.ts, serve.ts                                           | `pnpm test -- --run`         |
| 5      | `test(inngest): add comprehensive tests for rule extraction pipeline`     | rule-extractor.test.ts, learned-rules-expiry.test.ts, rule-handlers.test.ts | `pnpm test -- --run`         |
| 6      | `docs(story-map): mark GM-18 acceptance criteria as complete`             | phase1-story-map.md                                                         | —                            |

---

## Success Criteria

### Verification Commands

```bash
# Migration applied
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d learned_rules"
# Expected: table with 13 columns (id, tenant_id, entity_type, entity_id, scope, rule_text, source, status, source_task_id, slack_ts, slack_channel, created_at, confirmed_at)

# PostgREST accessible
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "http://localhost:54321/rest/v1/learned_rules?limit=1" | jq 'type'
# Expected: "array"

# Inngest functions registered
curl -s http://localhost:8288/v0/fns | jq '[.[] | select(.id | contains("rule"))] | length'
# Expected: 2 (rule-extractor + expiry cron)

# Tests pass
pnpm test -- --run
# Expected: no new failures

# Seed runs
pnpm prisma db seed
# Expected: exit 0

# Story map updated
grep -c "\[x\]" docs/2026-04-21-2202-phase1-story-map.md | head -1
# Expected: GM-18 criteria all checked
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] PostgREST access works for `learned_rules`
- [ ] GM-18 acceptance criteria in story map marked `[x]`
