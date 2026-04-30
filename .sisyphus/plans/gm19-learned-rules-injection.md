# GM-19: Learned Rules Injection into Prompts

## TL;DR

> **Quick Summary**: Inject confirmed learned rules from the `learned_rules` table into the AI employee's system prompt before each run, ranked by scope relevance and capped at a token budget. Also extend the weekly feedback-summarizer cron to synthesize overlapping rules.
>
> **Deliverables**:
>
> - Lifecycle queries confirmed rules and passes as `LEARNED_RULES_CONTEXT` env var to worker machines
> - Harness reads env var and appends "Learned Behaviors" section to system prompt
> - Feedback-summarizer extended with rule synthesis step (LLM-driven merge proposals)
> - Vitest unit tests for all new logic
> - Story-map checkboxes marked complete
>
> **Estimated Effort**: Short (1-2 days)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 6 → Task 7

---

## Context

### Original Request

Implement GM-19 from the Phase 1 story map (`docs/2026-04-21-2202-phase1-story-map.md`). Query confirmed learned rules from the `learned_rules` table and inject them into the AI employee's prompt as explicit behavioral instructions. Extend the weekly feedback-summarizer cron to detect overlapping rules, propose merges, and prune contradictions. Include automated tests and API endpoint verification. Mark story-map items as complete.

### Interview Summary

**Key Discussions**:

- GM-18 (dependency) is fully complete — `learned_rules` table exists with all columns and is populated by the rule-extractor pipeline
- The gap: confirmed rules are stored but NEVER read back into worker context
- Injection follows the established `FEEDBACK_CONTEXT` pattern: lifecycle assembles context → env var → harness reads and prepends to system_prompt

**Research Findings**:

- `learned_rules` schema: id, tenant_id, entity_type, entity_id, scope, rule_text, source, status, source_task_id, slack_ts, slack_channel, created_at, confirmed_at
- Harness assembly: `systemPrompt = archetype.system_prompt + FEEDBACK_CONTEXT` (lines 328-332 of opencode-harness.mts)
- Lifecycle FEEDBACK_CONTEXT assembly: lines 153-211 of employee-lifecycle.ts (queries PostgREST, builds string, injects env var)
- Feedback-summarizer: weekly cron, per-archetype loop, queries feedback → LLM themes → knowledge_bases. Has scoping bug (no tenant filter) — pre-existing, not in scope to fix
- Existing Slack button handlers for rule Confirm/Reject/Rephrase work for any learned_rules row — no new handlers needed

### Metis Review

**Identified Gaps** (addressed):

- Property-scoped ranking is unimplementable without `propertyId` in dispatch context → **Deferred**: implement archetype + tenant-wide only
- Feedback-summarizer has no `tenant_id` context for archetypes → **Fix**: add `tenant_id` to archetype select in summarizer
- Synthesis needs per-tenant Slack token → **Fix**: use `tenant_secrets` query pattern from rule-extractor
- `void archetypeId` at lifecycle line 81 could confuse developers → **Guardrail**: do not remove, use `archetypeId` from event data
- Missing acceptance criteria for rule-boundary truncation, min-rules-for-synthesis → **Added** to task ACs
- Docker rebuild required for harness changes → **Explicit step** in verification

---

## Work Objectives

### Core Objective

Close the loop on learned rules: confirmed rules stored by GM-18's extraction pipeline must flow back into the employee's context so every correction permanently improves future drafts.

### Concrete Deliverables

- New `build-learned-rules-context` step in `src/inngest/employee-lifecycle.ts`
- Updated prompt assembly in `src/workers/opencode-harness.mts` to consume `LEARNED_RULES_CONTEXT`
- New synthesis step in `src/inngest/triggers/feedback-summarizer.ts`
- Unit tests: `tests/inngest/learned-rules-injection.test.ts`, `tests/inngest/rule-synthesis.test.ts`
- Updated story-map checkboxes in `docs/2026-04-21-2202-phase1-story-map.md`

### Definition of Done

- [ ] `pnpm test -- --run` passes (no new failures)
- [ ] `pnpm build` succeeds
- [ ] Confirmed rules appear in system prompt when employee runs
- [ ] No rules section when zero confirmed rules exist
- [ ] Token budget enforced at rule boundaries
- [ ] Synthesis proposes merged rules via Slack

### Must Have

- Lifecycle queries `learned_rules` for confirmed rules matching tenant + archetype
- Rules injected as "## Learned Behaviors — follow these rules" section
- Ranked: archetype-specific first, then tenant-wide; recently confirmed first
- 8000 character cap (≈2000 tokens), truncated at complete rule boundaries
- Empty section omitted entirely (no empty headers, no empty env var)
- Non-fatal error handling (try/catch, proceed without rules on failure)
- Synthesis step in feedback-summarizer detects overlaps, proposes merges
- Synthesized rules stored with `source='weekly_synthesis'`, `status='proposed'`

### Must NOT Have (Guardrails)

- **No schema changes** — no new migrations, no new columns on `learned_rules`
- **No property-scoped ranking** — deferred; no `propertyId` in dispatch context
- **No new Slack button action IDs** — reuse existing `rule_confirm`/`rule_reject`/`rule_rephrase`
- **No tokenizer library** — use character-based budget (8000 chars)
- **No fix for feedback-summarizer scoping bug** — add TODO comment only, not in GM-19 scope
- **Do not touch delivery phase or REPLY_ANYWAY_CONTEXT path** in harness
- **Do not remove `void archetypeId`** at lifecycle line 81
- **Do not modify `inngest-serve.test.ts`** — pre-existing broken test per AGENTS.md

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, `pnpm test -- --run`)
- **Automated tests**: YES (Tests-after — unit tests for new logic)
- **Framework**: Vitest (bun not used in this project)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend logic**: Use Bash — run Vitest tests, assert pass counts
- **Integration**: Use Bash (curl) — query PostgREST, assert response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — core injection logic + synthesis, MAX PARALLEL):
├── Task 1: Lifecycle rules query + LEARNED_RULES_CONTEXT assembly [deep]
├── Task 2: Feedback-summarizer synthesis step extension [deep]

Wave 2 (After Wave 1 — harness consumption + tests + integration):
├── Task 3: Harness LEARNED_RULES_CONTEXT consumption (depends: 1) [quick]
├── Task 4: Unit tests for rules injection (depends: 1) [unspecified-high]
├── Task 5: Unit tests for rule synthesis (depends: 2) [unspecified-high]

Wave 3 (After Wave 2 — verification + cleanup):
├── Task 6: Docker rebuild + integration verification (depends: 3, 4, 5) [unspecified-high]
├── Task 7: Story-map checkbox updates + Telegram notification (depends: 6) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 6 → Task 7 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 3, 4, 6 | 1    |
| 2    | —          | 5, 6    | 1    |
| 3    | 1          | 6       | 2    |
| 4    | 1          | 6       | 2    |
| 5    | 2          | 6       | 2    |
| 6    | 3, 4, 5    | 7       | 3    |
| 7    | 6          | F1-F4   | 3    |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `deep`, T2 → `deep`
- **Wave 2**: **3** — T3 → `quick`, T4 → `unspecified-high`, T5 → `unspecified-high`
- **Wave 3**: **2** — T6 → `unspecified-high`, T7 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Lifecycle: Query confirmed learned rules and assemble LEARNED_RULES_CONTEXT

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, add a new step `build-learned-rules-context` immediately AFTER the existing `FEEDBACK_CONTEXT` assembly block (after line ~211)
  - Query PostgREST for confirmed rules: `GET /rest/v1/learned_rules?status=eq.confirmed&tenant_id=eq.{tenantId}&or=(and(entity_type.eq.archetype,entity_id.eq.{archetypeId}),scope.eq.common)&select=rule_text,entity_type,entity_id,scope,confirmed_at&order=confirmed_at.desc`
  - Sort results in code: archetype-scoped rules first (`entity_type='archetype' && entity_id === archetypeId`), then tenant-wide rules (`scope='common'` or `entity_type='tenant'`). Within each group, keep PostgREST's `confirmed_at DESC` ordering
  - Apply token budget cap: `MAX_LEARNED_RULES_CHARS = 8000`. Accumulate rules in sorted order. If adding the next rule's text would exceed the budget, stop — do NOT split a rule mid-text
  - Format the output string:

    ```
    ## Learned Behaviors — follow these rules

    - {rule_text_1}
    - {rule_text_2}
    ...
    ```

  - If zero rules returned (or query fails), do NOT set `LEARNED_RULES_CONTEXT` in the env object — omit the key entirely
  - Wrap the entire block in try/catch — on failure, log a warning and proceed without rules (non-fatal, exactly like FEEDBACK_CONTEXT pattern at lines 153-211)
  - Add `LEARNED_RULES_CONTEXT` to the machine env spread: `...(learnedRulesContext ? { LEARNED_RULES_CONTEXT: learnedRulesContext } : {})`
  - Export the `MAX_LEARNED_RULES_CHARS` constant so tests can reference it
  - Use `archetypeId` from the event data (not the `void`'d reference at line 81)

  **Must NOT do**:
  - Do NOT modify the FEEDBACK_CONTEXT assembly logic
  - Do NOT add property-scoped rules filtering (no `propertyId` available)
  - Do NOT remove or modify the `void archetypeId` at line 81
  - Do NOT change the delivery phase or REPLY_ANYWAY_CONTEXT paths
  - Do NOT add a tokenizer dependency — use `string.length`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Lifecycle is the core orchestration file — requires careful reading of the existing FEEDBACK_CONTEXT pattern and precise insertion without breaking adjacent logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI work
    - `git-master`: Standard commit, no complex git ops

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 6
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:153-211` — FEEDBACK_CONTEXT assembly pattern: PostgREST query → parse → format string → conditional env injection → try/catch. Follow this EXACT pattern for learned rules.
  - `src/inngest/employee-lifecycle.ts:221-229` — Machine env spread pattern showing how `FEEDBACK_CONTEXT` is conditionally injected. Add `LEARNED_RULES_CONTEXT` adjacent to this.

  **API/Type References**:
  - `prisma/schema.prisma:471-489` — `LearnedRule` model: columns are `rule_text`, `entity_type`, `entity_id`, `scope`, `status`, `confirmed_at`, `tenant_id`
  - PostgREST OR filter syntax: `or=(condition1,condition2)` — needed to query both archetype-scoped AND tenant-wide rules in one request

  **External References**:
  - PostgREST `or` filter docs: https://docs.postgrest.org/en/latest/references/api/tables_views.html#logical-operators

  **WHY Each Reference Matters**:
  - Lines 153-211: The FEEDBACK_CONTEXT block is the exact template — same structure (fetch → parse → format → inject), same error handling (try/catch, non-fatal), same env injection pattern. Copy this structure.
  - Lines 221-229: Shows the conditional spread pattern — learned rules must use the same `...(context ? { KEY: context } : {})` idiom.
  - Schema: Confirms which columns to SELECT and filter on — don't guess, use exactly these column names.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Confirmed rules are formatted and injected
    Tool: Bash (vitest)
    Preconditions: Unit test file exists at tests/inngest/learned-rules-injection.test.ts (from Task 4)
    Steps:
      1. Mock PostgREST fetch to return 3 confirmed rules: [{rule_text: "Always greet by name", entity_type: "archetype", entity_id: "arch-1", confirmed_at: "2026-04-28"}, {rule_text: "Mention checkout time", entity_type: "archetype", entity_id: "arch-1", confirmed_at: "2026-04-27"}, {rule_text: "Use formal tone", scope: "common", entity_type: "tenant", confirmed_at: "2026-04-26"}]
      2. Run the rules assembly logic
      3. Assert output string starts with "## Learned Behaviors — follow these rules"
      4. Assert archetype rules appear before tenant-wide rules
      5. Assert all 3 rules present as bullet points
    Expected Result: Formatted string with header, archetype rules first, tenant rules second
    Failure Indicators: Wrong order, missing header, missing rules
    Evidence: .sisyphus/evidence/task-1-rules-formatted.txt

  Scenario: Empty result omits env var entirely
    Tool: Bash (vitest)
    Preconditions: Unit test mocks PostgREST returning empty array
    Steps:
      1. Mock PostgREST fetch to return []
      2. Run the rules assembly logic
      3. Assert learnedRulesContext is undefined/falsy
      4. Assert LEARNED_RULES_CONTEXT key is NOT present in env object
    Expected Result: No LEARNED_RULES_CONTEXT key in env
    Failure Indicators: Empty string assigned, key present with empty value
    Evidence: .sisyphus/evidence/task-1-empty-rules.txt

  Scenario: Token budget enforced at rule boundaries
    Tool: Bash (vitest)
    Preconditions: Unit test mocks PostgREST returning rules that total >8000 chars
    Steps:
      1. Create 10 rules, each with ~1000 char rule_text
      2. Run the rules assembly logic
      3. Assert total string length <= 8000 + header length
      4. Assert no rule is cut mid-text (last rule is complete)
      5. Assert rules that would exceed budget are omitted entirely
    Expected Result: Output contains complete rules only, within budget
    Failure Indicators: Truncated rule text, exceeds budget
    Evidence: .sisyphus/evidence/task-1-token-budget.txt

  Scenario: PostgREST failure is non-fatal
    Tool: Bash (vitest)
    Preconditions: Unit test mocks PostgREST fetch to throw/return error
    Steps:
      1. Mock fetch to throw network error
      2. Run the lifecycle executing step
      3. Assert no exception propagates
      4. Assert LEARNED_RULES_CONTEXT is NOT in env (graceful degradation)
      5. Assert a warning is logged
    Expected Result: Lifecycle proceeds without rules, logs warning
    Failure Indicators: Exception thrown, lifecycle fails
    Evidence: .sisyphus/evidence/task-1-error-handling.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): query confirmed learned rules and inject as LEARNED_RULES_CONTEXT env var`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

- [x] 2. Feedback-summarizer: Add weekly rule synthesis step

  **What to do**:
  - In `src/inngest/triggers/feedback-summarizer.ts`, add a new step AFTER the existing per-archetype feedback summarization loop
  - First, fix the archetype select to include `tenant_id` and `notification_channel`: change `select=id,role_name` to `select=id,role_name,tenant_id,notification_channel`
  - Add `// TODO(GM-19): feedback query at line ~61 lacks tenant_id filter — pre-existing bug, out of scope` comment near the feedback query
  - For each archetype, add a new step `synthesize-rules-{archetype.id}`:
    1. Query confirmed rules: `GET /rest/v1/learned_rules?status=eq.confirmed&tenant_id=eq.{archetype.tenant_id}&entity_type=eq.archetype&entity_id=eq.{archetype.id}&select=id,rule_text,confirmed_at`
    2. If fewer than 2 confirmed rules, skip synthesis for this archetype (no merge possible)
    3. Call `callLLM` with model `anthropic/claude-haiku-4-5`, taskType `review`:
       - System prompt: "You are analyzing behavioral rules for an AI employee. Find rules that overlap (address the same topic — e.g., two rules about greeting style, two rules about mentioning fees) or contradict each other. For each group of overlapping rules, propose a single merged rule that captures the intent of all originals. For contradictions, flag them."
       - User prompt: Include all confirmed rule texts with their IDs
       - Expected JSON response: `{ merges: [{ original_rule_ids: string[], merged_rule_text: string, rationale: string }], contradictions: [{ rule_ids: string[], description: string }] }`
    4. For each proposed merge:
       - POST to `learned_rules`: `{ tenant_id, entity_type: 'archetype', entity_id: archetype.id, scope: 'entity', rule_text: merged_rule_text, source: 'weekly_synthesis', status: 'proposed', source_task_id: null }`
       - Resolve per-tenant Slack token: query `tenant_secrets` for `slack_bot_token` (follow pattern from `src/inngest/rule-extractor.ts` lines 106-120)
       - If `notification_channel` is null, skip Slack posting (log warning)
       - Post Slack message to `notification_channel` with the proposed merged rule + original rules it replaces + Confirm/Reject/Rephrase buttons (use existing action IDs: `rule_confirm`, `rule_reject`, `rule_rephrase`)
       - PATCH the new `learned_rules` row with `slack_ts` and `slack_channel` from the Slack response
    5. For contradictions: post a Slack message flagging the contradiction (informational, no buttons — just awareness)
  - If LLM returns no merges/contradictions, skip silently

  **Must NOT do**:
  - Do NOT fix the feedback-summarizer's pre-existing scoping bug on the feedback query — only add the TODO comment
  - Do NOT use `rule_confirm` with new action IDs — reuse existing ones
  - Do NOT auto-confirm synthesized rules — they must be `status: 'proposed'`
  - Do NOT add new Inngest function registrations — this is a new step within the existing function

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex logic — LLM call, JSON parsing, Slack posting with token resolution, PostgREST writes. Multiple failure modes to handle gracefully. Needs careful understanding of existing feedback-summarizer structure.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/inngest/triggers/feedback-summarizer.ts` — Full file: existing per-archetype loop structure, step naming convention, PostgREST query patterns, `callLLM` usage. The synthesis step slots in as a new step after the existing `summarize-feedback-{id}` step.
  - `src/inngest/rule-extractor.ts:106-120` — Per-tenant Slack token resolution pattern: queries `tenant_secrets` via PostgREST for `slack_bot_token`, decrypts if needed. Copy this pattern.
  - `src/inngest/rule-extractor.ts:130-185` — Slack message posting pattern for rule proposals: Block Kit structure with Confirm/Reject/Rephrase buttons. Reuse same `action_id` values.

  **API/Type References**:
  - `src/lib/call-llm.ts` — `callLLM` function signature and `taskType` parameter (use `'review'`)
  - `src/gateway/slack/handlers.ts:835-1079` — Existing button handlers for `rule_confirm`, `rule_reject`, `rule_rephrase`. These handle ANY `learned_rules` row — synthesized rules will be handled automatically if they use these action IDs.

  **WHY Each Reference Matters**:
  - feedback-summarizer.ts: Template for the loop structure and step naming
  - rule-extractor.ts lines 106-120: Without this pattern, the synthesis step has no Slack token and can't post messages. This is the only way to get per-tenant tokens in the gateway process.
  - rule-extractor.ts lines 130-185: The Slack Block Kit structure with action_ids must match exactly for existing handlers to work

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Synthesis detects overlapping rules and proposes merge
    Tool: Bash (vitest)
    Preconditions: Unit test at tests/inngest/rule-synthesis.test.ts (from Task 5)
    Steps:
      1. Mock PostgREST to return archetype with tenant_id and notification_channel
      2. Mock PostgREST to return 3 confirmed rules for that archetype (2 about greeting style, 1 about fees)
      3. Mock callLLM to return { merges: [{ original_rule_ids: ["id1","id2"], merged_rule_text: "Greet guests warmly by name", rationale: "Both rules address greeting" }], contradictions: [] }
      4. Mock PostgREST POST to learned_rules (capture body)
      5. Mock Slack postMessage (capture payload)
      6. Run synthesis step
      7. Assert POST body contains: source='weekly_synthesis', status='proposed', entity_type='archetype'
      8. Assert Slack message contains "Greet guests warmly by name" and Confirm/Reject buttons
    Expected Result: New proposed rule created, Slack message posted with correct buttons
    Failure Indicators: Wrong source, wrong status, missing Slack post, wrong action_ids
    Evidence: .sisyphus/evidence/task-2-synthesis-merge.txt

  Scenario: Synthesis skips when fewer than 2 confirmed rules
    Tool: Bash (vitest)
    Preconditions: Unit test mocks PostgREST returning 1 confirmed rule
    Steps:
      1. Mock PostgREST to return 1 confirmed rule for archetype
      2. Run synthesis step
      3. Assert callLLM was NOT called
      4. Assert no new learned_rules row created
    Expected Result: Synthesis skipped silently
    Failure Indicators: LLM called unnecessarily, rule created
    Evidence: .sisyphus/evidence/task-2-synthesis-skip.txt

  Scenario: Synthesis handles null notification_channel gracefully
    Tool: Bash (vitest)
    Preconditions: Unit test mocks archetype with notification_channel=null
    Steps:
      1. Mock archetype with null notification_channel and 3 confirmed rules
      2. Mock callLLM to return a merge proposal
      3. Run synthesis step
      4. Assert learned_rules row IS created (even without Slack)
      5. Assert Slack postMessage was NOT called
      6. Assert a warning was logged
    Expected Result: Rule created, Slack skipped, warning logged
    Failure Indicators: Exception thrown, no rule created
    Evidence: .sisyphus/evidence/task-2-null-channel.txt
  ```

  **Commit**: YES
  - Message: `feat(summarizer): add weekly rule synthesis step to detect overlapping confirmed rules`
  - Files: `src/inngest/triggers/feedback-summarizer.ts`
  - Pre-commit: `pnpm build`

---

- [x] 3. Harness: Consume LEARNED_RULES_CONTEXT and append to system prompt

  **What to do**:
  - In `src/workers/opencode-harness.mts`, at lines 328-336 (the prompt assembly block), add consumption of `LEARNED_RULES_CONTEXT` after the existing `FEEDBACK_CONTEXT` consumption
  - Read `process.env.LEARNED_RULES_CONTEXT ?? ''`
  - Append to `systemPrompt` AFTER `feedbackContext`:
    ```typescript
    const learnedRulesContext = process.env.LEARNED_RULES_CONTEXT ?? '';
    let systemPrompt = feedbackContext
      ? `${baseSystemPrompt}\n\n${feedbackContext}`
      : baseSystemPrompt;
    if (learnedRulesContext) {
      systemPrompt = `${systemPrompt}\n\n${learnedRulesContext}`;
    }
    ```
  - This places learned rules AFTER the base prompt and AFTER feedback context in the system prompt hierarchy
  - Do NOT modify the `isDeliveryPhase` branch or the `REPLY_ANYWAY_CONTEXT` branch — only the normal execution path

  **Must NOT do**:
  - Do NOT touch the delivery phase assembly (lines 267-268)
  - Do NOT touch the REPLY_ANYWAY_CONTEXT assembly
  - Do NOT add PostgREST queries in the harness (rules are already in the env var)
  - Do NOT change AGENTS.md assembly (`resolveAgentsMd`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, ~5 lines of new code, following an obvious pattern already visible 3 lines above
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 1)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `src/workers/opencode-harness.mts:328-336` — Current prompt assembly: `feedbackContext` read from env → conditional prepend to `baseSystemPrompt`. The learned rules code goes immediately after, following identical pattern.

  **WHY Each Reference Matters**:
  - Lines 328-336: The exact insertion point. The executor must read these lines, understand the pattern, and replicate it for `LEARNED_RULES_CONTEXT`. There is nothing else to reference.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: LEARNED_RULES_CONTEXT is appended to system prompt
    Tool: Bash (vitest — covered by Task 4 tests)
    Steps:
      1. Set process.env.LEARNED_RULES_CONTEXT = "## Learned Behaviors — follow these rules\n- Always greet by name"
      2. Set process.env.FEEDBACK_CONTEXT = "Recent feedback: be more formal"
      3. Run prompt assembly logic
      4. Assert systemPrompt contains baseSystemPrompt THEN feedbackContext THEN learnedRulesContext (in order)
    Expected Result: systemPrompt = baseSystemPrompt + "\n\n" + feedbackContext + "\n\n" + learnedRulesContext
    Failure Indicators: Wrong order, missing section, double newlines
    Evidence: .sisyphus/evidence/task-3-prompt-assembly.txt

  Scenario: Empty LEARNED_RULES_CONTEXT does not add blank section
    Tool: Bash (vitest — covered by Task 4 tests)
    Steps:
      1. Set process.env.LEARNED_RULES_CONTEXT = '' (or unset)
      2. Run prompt assembly logic
      3. Assert systemPrompt does NOT contain "Learned Behaviors"
      4. Assert systemPrompt ends with feedbackContext (or baseSystemPrompt if no feedback)
    Expected Result: No trailing whitespace or empty section
    Failure Indicators: Trailing newlines, "Learned Behaviors" header present
    Evidence: .sisyphus/evidence/task-3-empty-context.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(harness): consume LEARNED_RULES_CONTEXT and append Learned Behaviors section to system prompt`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

---

- [x] 4. Unit tests: Learned rules injection (lifecycle + harness)

  **What to do**:
  - Create `tests/inngest/learned-rules-injection.test.ts`
  - Test the lifecycle's `build-learned-rules-context` step logic:
    - **Ranking test**: Mock PostgREST returning mixed archetype + tenant-wide rules. Assert archetype rules come first, then tenant-wide. Within each group, most recent `confirmed_at` first.
    - **Token budget test**: Mock PostgREST returning rules totaling >8000 chars. Assert output is ≤8000 chars + header, and no rule is truncated mid-text. Last included rule is complete.
    - **Empty rules test**: Mock PostgREST returning `[]`. Assert `LEARNED_RULES_CONTEXT` is not set in env object (key absent, not empty string).
    - **Error handling test**: Mock PostgREST fetch to throw. Assert lifecycle proceeds without exception, `LEARNED_RULES_CONTEXT` absent, warning logged.
    - **Formatting test**: Assert output format is exactly `## Learned Behaviors — follow these rules\n\n- rule1\n- rule2\n...`
  - Test the harness prompt assembly:
    - **Both contexts present**: Assert systemPrompt = base + feedback + rules (in order)
    - **Only rules, no feedback**: Assert systemPrompt = base + rules
    - **Neither present**: Assert systemPrompt = base only
  - Follow existing test patterns in `tests/inngest/` — mock `fetch` globally, use `vi.fn()` for step functions

  **Must NOT do**:
  - Do NOT require a live database — all tests use mocked PostgREST responses
  - Do NOT modify existing test files
  - Do NOT add tests for the synthesis step (that's Task 5)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test scenarios, requires understanding the lifecycle mock patterns, but straightforward test writing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/inngest/rule-extractor.test.ts` — Test structure for Inngest functions in this project: how to mock `step.run`, mock `fetch` for PostgREST, assert PostgREST calls. Follow this pattern exactly.
  - `tests/inngest/learned-rules-expiry.test.ts` — Another example of testing an Inngest function that queries PostgREST. Shows mock setup for `GET` + `PATCH` patterns.

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts` — The actual implementation being tested (after Task 1 modifies it)

  **WHY Each Reference Matters**:
  - rule-extractor.test.ts: Shows the canonical way to mock PostgREST in this project's test suite — global fetch mock, URL matching, response factories. Without following this, the tests will be inconsistent with the rest of the suite.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All injection tests pass
    Tool: Bash
    Preconditions: Tests written, Tasks 1 and 3 complete
    Steps:
      1. Run: pnpm test -- --run tests/inngest/learned-rules-injection.test.ts
      2. Assert exit code 0
      3. Assert all test cases pass (expect ≥7 tests: ranking, budget, empty, error, formatting, both-contexts, rules-only)
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure, import errors
    Evidence: .sisyphus/evidence/task-4-test-results.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `test(learned-rules): add unit tests for rules injection and synthesis`
  - Files: `tests/inngest/learned-rules-injection.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/learned-rules-injection.test.ts`

---

- [x] 5. Unit tests: Rule synthesis (feedback-summarizer extension)

  **What to do**:
  - Create `tests/inngest/rule-synthesis.test.ts`
  - Test the synthesis step logic:
    - **Merge detection test**: Mock PostgREST returning 3 confirmed rules. Mock `callLLM` to return merge proposal. Assert new `learned_rules` row is POSTed with `source='weekly_synthesis'`, `status='proposed'`. Assert Slack message posted with `rule_confirm`/`rule_reject` action IDs.
    - **Skip when <2 rules test**: Mock PostgREST returning 1 rule. Assert `callLLM` is NOT called. Assert no new rules created.
    - **Skip when 0 rules test**: Mock PostgREST returning 0 rules. Assert synthesis step completes without errors.
    - **Null notification_channel test**: Mock archetype with `notification_channel: null`. Assert rule IS created but Slack is NOT called. Assert warning logged.
    - **LLM returns no merges test**: Mock `callLLM` returning `{ merges: [], contradictions: [] }`. Assert no new rules created.
    - **Tenant_id added to archetype select test**: Assert the archetype query in the summarizer includes `tenant_id` and `notification_channel` in the select fields.
    - **TODO comment test**: Assert feedback-summarizer.ts contains the TODO comment about the scoping bug
  - Follow same mock patterns as Task 4

  **Must NOT do**:
  - Do NOT test the existing feedback summarization logic — only the new synthesis step
  - Do NOT modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test scenarios, requires understanding both the synthesis logic and the Slack posting pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/inngest/rule-extractor.test.ts` — Shows how to mock callLLM, mock PostgREST POST for rule creation, and mock Slack API calls in this test suite
  - `tests/gateway/slack/rule-handlers.test.ts` — Shows how to assert Slack action_id values in test assertions

  **API/Type References**:
  - `src/inngest/triggers/feedback-summarizer.ts` — The actual implementation being tested (after Task 2 modifies it)

  **WHY Each Reference Matters**:
  - rule-extractor.test.ts: The synthesis step is structurally similar to rule extraction (LLM call → DB write → Slack post). The test patterns translate directly.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All synthesis tests pass
    Tool: Bash
    Preconditions: Tests written, Task 2 complete
    Steps:
      1. Run: pnpm test -- --run tests/inngest/rule-synthesis.test.ts
      2. Assert exit code 0
      3. Assert all test cases pass (expect ≥7 tests)
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure, import errors
    Evidence: .sisyphus/evidence/task-5-test-results.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `test(learned-rules): add unit tests for rules injection and synthesis`
  - Files: `tests/inngest/rule-synthesis.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/rule-synthesis.test.ts`

---

- [x] 6. Docker rebuild + full test suite + integration verification

  **What to do**:
  - Run `pnpm build` and verify no compilation errors
  - Run `pnpm test -- --run` and verify all tests pass (accounting for pre-existing failures: `container-boot.test.ts`, `inngest-serve.test.ts`)
  - Run `pnpm lint` and verify no new lint errors
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .` (REQUIRED because Task 3 modified `opencode-harness.mts`)
  - Verify the learned rules injection via PostgREST integration:
    1. Seed a confirmed rule via curl: `POST /rest/v1/learned_rules` with `tenant_id` matching VLRE (`00000000-0000-0000-0000-000000000003`), `entity_type: 'archetype'`, `entity_id` matching the daily-summarizer archetype ID (`00000000-0000-0000-0000-000000000013`), `status: 'confirmed'`, `rule_text: 'Always mention the pet deposit for Airbnb guests'`, `scope: 'entity'`, `confirmed_at: now()`
    2. Query back: `GET /rest/v1/learned_rules?tenant_id=eq.00000000-0000-0000-0000-000000000003&status=eq.confirmed` and assert the seeded rule is returned
    3. Clean up: `DELETE /rest/v1/learned_rules?rule_text=eq.Always mention the pet deposit for Airbnb guests`
  - Verify zero-rules case: query confirmed rules for a tenant with no rules, assert empty array
  - Capture all evidence

  **Must NOT do**:
  - Do NOT trigger a full E2E employee run (too heavy for verification)
  - Do NOT fix pre-existing test failures
  - Do NOT push to remote

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step verification with Docker build (tmux required for long-running commands), PostgREST curl commands, and evidence capture
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 4, 5

  **References** (CRITICAL):

  **Pattern References**:
  - `AGENTS.md` — Docker rebuild requirement: "Any modification to files under `src/workers/` requires rebuilding the Docker image." Also long-running command patterns with tmux.

  **External References**:
  - PostgREST API: base URL is `http://localhost:54321/rest/v1/` with `apikey` header using `SUPABASE_SECRET_KEY` from `.env`

  **WHY Each Reference Matters**:
  - AGENTS.md rebuild requirement: The harness change in Task 3 means the Docker image must be rebuilt before any E2E test could work. This task ensures the rebuild happens.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build and test suite passes
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Run: pnpm test -- --run
      4. Assert all tests pass (minus known pre-existing failures)
      5. Run: pnpm lint
      6. Assert no new lint errors
    Expected Result: Build clean, tests pass, lint clean
    Failure Indicators: Compilation error, new test failure, new lint error
    Evidence: .sisyphus/evidence/task-6-build-test.txt

  Scenario: Docker image rebuilds successfully
    Tool: Bash (tmux for long-running)
    Steps:
      1. Run in tmux: docker build -t ai-employee-worker:latest .
      2. Poll until complete
      3. Assert exit code 0
    Expected Result: Docker image built successfully
    Failure Indicators: Build failure, missing dependency
    Evidence: .sisyphus/evidence/task-6-docker-build.txt

  Scenario: PostgREST confirms rule can be seeded and queried
    Tool: Bash (curl)
    Steps:
      1. Read SUPABASE_SECRET_KEY from .env
      2. POST to http://localhost:54321/rest/v1/learned_rules with confirmed rule payload
      3. Assert 201 response
      4. GET http://localhost:54321/rest/v1/learned_rules?tenant_id=eq.00000000-0000-0000-0000-000000000003&status=eq.confirmed
      5. Assert response contains the seeded rule
      6. DELETE the seeded rule
      7. Assert 200/204 response
    Expected Result: Rule seeded, queried, and cleaned up
    Failure Indicators: PostgREST error, rule not returned, cleanup fails
    Evidence: .sisyphus/evidence/task-6-postgrest-integration.txt
  ```

  **Commit**: NO (verification only, no code changes)

---

- [x] 7. Story-map checkbox updates + Telegram notification

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md` to mark all GM-19 acceptance criteria checkboxes as `[x]`:
    - Line 932: `- [x] Harness or instructions builder queries learned_rules...`
    - Line 933: `- [x] Rules injected into employee context...`
    - Line 934: `- [x] Ranked by relevance...`
    - Line 935: `- [x] Token budget cap...`
    - Line 936: `- [x] If no confirmed rules exist, the section is omitted...`
    - Line 937: `- [x] Weekly synthesis cron...`
    - Line 938: `- [x] Manual test on VLRE...` (mark based on PostgREST integration verification from Task 6)
  - Send Telegram notification:
    ```bash
    tsx scripts/telegram-notify.ts "✅ GM-19 (Learned Rules Injection) complete — All tasks done. Come back to review results."
    ```

  **Must NOT do**:
  - Do NOT modify any other checkboxes in the story-map (only GM-19)
  - Do NOT edit the story text/description — only checkboxes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple text edits + one script invocation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References** (CRITICAL):

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:930-938` — The exact lines to edit (GM-19 acceptance criteria checkboxes)
  - `scripts/telegram-notify.ts` — Telegram notification script

  **WHY Each Reference Matters**:
  - Story-map lines 930-938: These are the exact checkboxes to flip from `[ ]` to `[x]`. The executor must match exact line content to avoid editing wrong checkboxes.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All GM-19 checkboxes are marked complete
    Tool: Bash (grep)
    Steps:
      1. grep "- \[ \]" docs/2026-04-21-2202-phase1-story-map.md near GM-19 section
      2. Assert zero unchecked boxes between GM-19 header and the next "---" separator
      3. grep "- \[x\]" in same section
      4. Assert 7 checked boxes
    Expected Result: All 7 GM-19 criteria marked [x]
    Failure Indicators: Any unchecked boxes remain, wrong section edited
    Evidence: .sisyphus/evidence/task-7-checkboxes.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ GM-19 (Learned Rules Injection) complete — All tasks done. Come back to review results."
      2. Assert exit code 0
    Expected Result: Notification sent successfully
    Failure Indicators: Script error, network failure
    Evidence: .sisyphus/evidence/task-7-telegram.txt
  ```

  **Commit**: YES
  - Message: `docs(story-map): mark GM-19 acceptance criteria as complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: none

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Seed a confirmed rule in `learned_rules` via PostgREST for the VLRE tenant + daily-summarizer archetype. Trigger the employee. Verify via Fly.io machine env or lifecycle logs that `LEARNED_RULES_CONTEXT` was set and contains the seeded rule text. Verify with zero confirmed rules that `LEARNED_RULES_CONTEXT` is absent.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                                       | Files                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1    | `feat(lifecycle): query confirmed learned rules and inject as LEARNED_RULES_CONTEXT env var`         | `src/inngest/employee-lifecycle.ts`                                                     |
| 2    | `feat(summarizer): add weekly rule synthesis step to detect overlapping confirmed rules`             | `src/inngest/triggers/feedback-summarizer.ts`                                           |
| 3    | `feat(harness): consume LEARNED_RULES_CONTEXT and append Learned Behaviors section to system prompt` | `src/workers/opencode-harness.mts`                                                      |
| 4+5  | `test(learned-rules): add unit tests for rules injection and synthesis`                              | `tests/inngest/learned-rules-injection.test.ts`, `tests/inngest/rule-synthesis.test.ts` |
| 7    | `docs(story-map): mark GM-19 acceptance criteria as complete`                                        | `docs/2026-04-21-2202-phase1-story-map.md`                                              |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: no errors
pnpm test -- --run            # Expected: all pass (minus pre-existing failures)
pnpm lint                     # Expected: no new errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] GM-19 checkboxes marked [x] in story-map
- [ ] Telegram notification sent
