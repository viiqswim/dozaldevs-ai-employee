# Delivery Phase OpenCode Migration & Local Testing Infrastructure

## TL;DR

> **Quick Summary**: Replace the hardcoded `runDeliveryPhase()` in the OpenCode harness with a proper OpenCode session driven by `archetype.delivery_instructions`, add mock support to `send-message.ts` for safe local testing, and create a platform-level local E2E testing guide for future agents.
>
> **Deliverables**:
>
> - `send-message.ts` with `HOSTFULLY_MOCK=true` support + fixture file
> - `opencode-harness.mts` delivery phase rewritten as OpenCode session
> - `employee-lifecycle.ts` passes `HOSTFULLY_MOCK` to delivery machine env
> - Updated `delivery_instructions` in seed.ts (all 3 archetypes: explicit output contract)
> - New platform-level local E2E testing guide doc
> - AGENTS.md Reference Documents table updated with new guide reference
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 6 → F1-F4

---

## Context

### Original Request

Three gaps discovered after completing the `guest-messaging-webhook-driven` plan:

1. `send-message.ts` has no mock support — pressing Approve/Edit buttons locally hits real Hostfully API
2. `runDeliveryPhase()` is hardcoded Hostfully-specific logic, not an OpenCode session — contradicts PLAT-05 vision
3. No platform-level local E2E testing guide exists for future AI agents

### Interview Summary

**Key Discussions**:

- Mock pattern is well-established in 3 other Hostfully tools — copy-paste with fixture path change
- Delivery phase ignores `archetype.delivery_instructions` entirely (`_archetype` prefix = unused param)
- Working phase uses `runOpencodeSession(systemPrompt, instructions, model)` — same pattern applies to delivery
- `delivery_instructions` already exists in seed.ts with correct natural language content
- User explicitly wants AGENTS.md updated so future agents know how to test locally

**Research Findings**:

- Mock pattern: `process.env['HOSTFULLY_MOCK'] === 'true'` → dynamic imports → read fixture → stdout.write → return
- `runOpencodeSession()` signature: `(systemPrompt: string, instructions: string, model: string) → { content, metadata }`
- `runOpencodeSession()` throws if `/tmp/summary.txt` not written — delivery_instructions must include this
- Delivery machine receives `tenantEnvForApproval` (all tenant secrets + OPENROUTER_API_KEY) + TASK_ID + SUPABASE creds
- `HOSTFULLY_MOCK` is in platform env whitelist but lifecycle doesn't explicitly pass it to delivery machine
- Current `runDeliveryPhase()` reads deliverable from DB via PostgREST — new approach should inject it into the prompt

### Metis Review

**Identified Gaps** (addressed):

- `writeOpencodeAuth()` or equivalent auth setup must be called before delivery OpenCode session → included in Task 4
- `HOSTFULLY_MOCK` doesn't reach delivery container unless explicitly passed → added Task 2
- `/tmp/summary.txt` must be written or `runOpencodeSession()` throws → addressed in Task 3 (delivery_instructions update)
- `execSync` import may become dead after removing `runDeliveryPhase()` → included in Task 4 cleanup
- Post-session must patch `Done` and log `status_transitions` (not `Submitting`) → explicit in Task 4
- ALL archetypes need `/tmp/summary.txt` instruction in delivery_instructions (not just guest-messaging) → Task 3 covers all 3

---

## Work Objectives

### Core Objective

Make delivery phase architecture-compliant (OpenCode-driven, not hardcoded) and enable fully-isolated local E2E testing without hitting real external APIs.

### Concrete Deliverables

- `src/worker-tools/hostfully/send-message.ts` — HOSTFULLY_MOCK check added
- `src/worker-tools/hostfully/fixtures/send-message/default.json` — mock fixture
- `src/inngest/employee-lifecycle.ts` — HOSTFULLY_MOCK passthrough in delivery env
- `src/workers/opencode-harness.mts` — `runDeliveryPhase()` replaced with OpenCode session
- `prisma/seed.ts` — delivery_instructions updated for all 3 approval-required archetypes
- `docs/2026-05-04-2023-local-e2e-testing.md` — platform-level testing guide
- `AGENTS.md` — new Reference Documents table row

### Definition of Done

- [ ] `HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/send-message.ts --lead-id "x" --message "y"` → exit 0, valid JSON
- [ ] `pnpm build` → 0 errors
- [ ] `pnpm lint` → 0 errors
- [ ] Docker rebuild + full E2E: trigger guest-messaging → approve → task reaches `Done` (with HOSTFULLY_MOCK=true)
- [ ] AGENTS.md has new reference table row for local E2E testing guide

### Must Have

- Mock check in `send-message.ts` follows exact same pattern as other 3 Hostfully tools
- Delivery phase uses `runOpencodeSession()` (not execSync, not hardcoded logic)
- `delivery_instructions` drives behavior (archetype-agnostic harness)
- Harness patches `Done` after delivery session (not `Submitting`)
- `status_transitions` record logged for `Delivering → Done`
- Platform testing guide in AGENTS.md Reference Documents table
- Testing guide covers: mock convention, fixture structure, env propagation, how to add mocks to new tools

### Must NOT Have (Guardrails)

- No per-lead-id fixture variant in send-message mock (single default.json is sufficient)
- No changes to `runOpencodeSession()` function signature or internals
- No `FEEDBACK_CONTEXT` or `LEARNED_RULES_CONTEXT` injected into delivery session
- No AGENTS.md resolution in delivery phase (delivery instructions are self-contained)
- No modifications to existing `docs/testing/guest-messaging/` files
- No unit tests for the mock check (existing pattern has none — don't add now)
- No changes to Summarizer behavior beyond adding `/tmp/summary.txt` write instruction to its delivery_instructions

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None for these changes (mock pattern has no tests; delivery is E2E-verified)
- **Framework**: vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run tool with mock env, verify stdout/exit code
- **Harness changes**: Use Bash — `pnpm build` + `pnpm lint` + Docker rebuild
- **E2E**: Use Bash (curl) — trigger webhook, approve via curl, poll task status
- **Documentation**: Use Bash (grep) — verify AGENTS.md row, verify doc structure

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 3 independent quick tasks):
├── Task 1: send-message.ts mock support + fixture [quick]
├── Task 2: HOSTFULLY_MOCK passthrough in lifecycle delivery env [quick]
└── Task 3: Update delivery_instructions in seed.ts (all 3 archetypes) [quick]

Wave 2 (After Wave 1 — main architectural change):
└── Task 4: Replace runDeliveryPhase() with OpenCode session (depends: 1, 2, 3) [deep]

Wave 3 (After Wave 2 — build + verify):
├── Task 5: Docker rebuild + seed apply + build verification (depends: 4) [quick]
└── Task 6: Full E2E verification (depends: 5) [unspecified-high]

Wave 4 (After Wave 3 — documentation):
├── Task 7: Create platform-level local E2E testing guide (depends: 6) [writing]
└── Task 8: Add AGENTS.md reference table row + Telegram notification (depends: 7) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | -          | 4, 5   | 1    |
| 2    | -          | 4, 5   | 1    |
| 3    | -          | 4, 5   | 1    |
| 4    | 1, 2, 3    | 5      | 2    |
| 5    | 4          | 6      | 3    |
| 6    | 5          | 7      | 3    |
| 7    | 6          | 8      | 4    |
| 8    | 7          | F1-F4  | 4    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 1 task — T4 → `deep`
- **Wave 3**: 2 tasks — T5 → `quick`, T6 → `unspecified-high`
- **Wave 4**: 2 tasks — T7 → `writing`, T8 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Add HOSTFULLY_MOCK support to send-message.ts

  **What to do**:
  - Add the `HOSTFULLY_MOCK=true` check to `src/worker-tools/hostfully/send-message.ts` following the exact pattern from `get-reservations.ts` (simplest variant — no per-ID fallback)
  - Place the mock check inside `main()`, AFTER the `--help` block (after line ~108) and BEFORE the `--lead-id`/`--message` validation (before line ~110)
  - The mock block must: dynamically import `node:fs`, `node:path`, `node:url`; compute `__dirname` via `dirname(fileURLToPath(import.meta.url))`; read fixture from `fixtures/send-message/default.json`; write to stdout via `process.stdout.write(fixtureData.trimEnd() + '\n')`; then `return`
  - Create fixture file `src/worker-tools/hostfully/fixtures/send-message/default.json` with content: `{"sent":true,"messageId":"mock-message-id-001","timestamp":"2026-05-01T14:00:00Z"}`
  - Use the exact 2-line comment: `// HOSTFULLY_MOCK: return fixture data instead of calling the real API.` / `// Set HOSTFULLY_MOCK=true in .env for local E2E testing without real Hostfully credentials.`

  **Must NOT do**:
  - Do NOT add per-lead-id fixture variant (unlike get-messages.ts)
  - Do NOT require `HOSTFULLY_API_KEY` in mock mode (the mock block returns before API key check)
  - Do NOT add logging (process.stderr.write) in the mock block — silent except stdout
  - Do NOT use `process.exit(0)` — use `return` to exit main() cleanly

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change + one new fixture file, following an established copy-paste pattern
  - **Skills**: `[]`
    - No specialized skills needed — this is a straightforward pattern replication
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/worker-tools/hostfully/get-reservations.ts:73-84` — Exact mock pattern to copy (simplest variant, no per-ID fallback). Copy this block verbatim, only changing the fixture path from `'get-reservations'` to `'send-message'`
  - `src/worker-tools/hostfully/get-property.ts:62-73` — Alternative reference (identical pattern)

  **API/Type References** (contracts to implement against):
  - `src/worker-tools/hostfully/send-message.ts:155-160` — The success output shape: `{ sent: true, messageId: uid|null, timestamp: createdUtcDateTime|null }`. The fixture must match this shape.

  **Test References**:
  - None (existing mock pattern has no unit tests — do not add)

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `get-reservations.ts:73-84` — This IS the pattern. Copy it. Change only the fixture subdirectory name.
  - `send-message.ts:155-160` — The fixture JSON must match the real success output shape so consuming code (the OpenCode model) gets consistent data whether mock or real.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock mode returns fixture data without API key
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY is NOT set in environment
    Steps:
      1. Run: unset HOSTFULLY_API_KEY && HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/send-message.ts --lead-id "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb" --message "Test reply to guest"
      2. Assert exit code is 0
      3. Assert stdout is exactly: {"sent":true,"messageId":"mock-message-id-001","timestamp":"2026-05-01T14:00:00Z"}
    Expected Result: Exit 0, stdout matches fixture content exactly (trimmed + newline)
    Failure Indicators: Exit code 1, stderr contains "HOSTFULLY_API_KEY", or stdout is empty
    Evidence: .sisyphus/evidence/task-1-mock-no-api-key.txt

  Scenario: Real mode still requires API key when mock is disabled
    Tool: Bash
    Preconditions: HOSTFULLY_MOCK is NOT set (or set to anything other than 'true')
    Steps:
      1. Run: unset HOSTFULLY_API_KEY && unset HOSTFULLY_MOCK && tsx src/worker-tools/hostfully/send-message.ts --lead-id "test" --message "test" 2>&1; echo "EXIT:$?"
      2. Assert exit code is 1
      3. Assert stderr contains "HOSTFULLY_API_KEY"
    Expected Result: Exit 1, error message about missing API key
    Failure Indicators: Exit 0 (would mean mock is active when it shouldn't be)
    Evidence: .sisyphus/evidence/task-1-real-requires-key.txt

  Scenario: Fixture file exists and is valid JSON
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: cat src/worker-tools/hostfully/fixtures/send-message/default.json | jq .
      2. Assert jq exits 0 (valid JSON)
      3. Assert .sent is true
      4. Assert .messageId is "mock-message-id-001"
      5. Assert .timestamp is "2026-05-01T14:00:00Z"
    Expected Result: Valid JSON with all 3 expected fields
    Failure Indicators: jq parse error, missing fields, wrong values
    Evidence: .sisyphus/evidence/task-1-fixture-valid.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-mock-no-api-key.txt — stdout + exit code from mock run
  - [ ] task-1-real-requires-key.txt — stderr + exit code from real run without key
  - [ ] task-1-fixture-valid.txt — jq parse output

  **Commit**: YES
  - Message: `feat(hostfully): add HOSTFULLY_MOCK support to send-message.ts`
  - Files: `src/worker-tools/hostfully/send-message.ts`, `src/worker-tools/hostfully/fixtures/send-message/default.json`
  - Pre-commit: `HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/send-message.ts --lead-id "x" --message "y" > /dev/null && echo "OK"`

- [x] 2. Pass HOSTFULLY_MOCK to delivery machine environment

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find the delivery machine dispatch section (lines ~908-941, inside the `handle-approval-result` step after approval is confirmed)
  - Add `HOSTFULLY_MOCK: process.env['HOSTFULLY_MOCK'] ?? ''` to the env object for BOTH:
    - The `runLocalDockerContainer()` call (local Docker path, around line 912)
    - The `createMachine()` call (Fly.io path, around line 934)
  - This ensures mock mode propagates from the gateway process to the delivery container

  **Must NOT do**:
  - Do NOT change any other env vars in the delivery dispatch
  - Do NOT add HOSTFULLY_MOCK to the working phase machine dispatch (it's already handled by `loadTenantEnv` platform whitelist for working phase)
  - Do NOT modify the retry logic or error handling around delivery dispatch
  - Do NOT change how `tenantEnvForApproval` is built

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-line addition (one per dispatch path) in a known location
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:908-926` — Local Docker delivery dispatch: the `env: { ... }` object where `HOSTFULLY_MOCK` must be added
  - `src/inngest/employee-lifecycle.ts:927-941` — Fly.io delivery dispatch: the `env: { ... }` object where `HOSTFULLY_MOCK` must be added
  - `src/gateway/services/tenant-env-loader.ts:5-17` — The `PLATFORM_ENV_WHITELIST` array that already includes `'HOSTFULLY_MOCK'` for the working phase. This confirms the convention — delivery phase just needs manual passthrough since it uses `tenantEnvForApproval` (not `loadTenantEnv`)

  **WHY Each Reference Matters**:
  - Lines 908-926 and 927-941 are the EXACT locations where the env object is built for the delivery container. Adding one key-value pair to each is the complete fix.
  - `tenant-env-loader.ts` confirms `HOSTFULLY_MOCK` is a platform-level env var (not a tenant secret), so it must be passed explicitly to delivery machines which don't call `loadTenantEnv` themselves.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: HOSTFULLY_MOCK appears in both delivery dispatch paths
    Tool: Bash
    Preconditions: Task 2 changes committed
    Steps:
      1. Run: grep -n "HOSTFULLY_MOCK" src/inngest/employee-lifecycle.ts
      2. Assert at least 2 matches (one per dispatch path)
      3. Verify each match is inside an env object literal (surrounded by other env vars)
    Expected Result: 2+ occurrences of HOSTFULLY_MOCK in lifecycle, within delivery dispatch env blocks
    Failure Indicators: 0 or 1 match, or match is outside the delivery section
    Evidence: .sisyphus/evidence/task-2-grep-hostfully-mock.txt

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Preconditions: Task 2 changes applied
    Steps:
      1. Run: pnpm build 2>&1 | tail -5
      2. Assert exit code is 0
    Expected Result: Build succeeds with no TypeScript errors
    Failure Indicators: Type errors related to the new env property
    Evidence: .sisyphus/evidence/task-2-build-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-grep-hostfully-mock.txt — grep output showing both occurrences
  - [ ] task-2-build-check.txt — pnpm build output

  **Commit**: YES
  - Message: `fix(lifecycle): pass HOSTFULLY_MOCK to delivery machine env`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Update delivery_instructions in seed.ts with output contract

  **What to do**:
  - In `prisma/seed.ts`, update `delivery_instructions` for ALL 3 approval-required archetypes to include:
    1. Explicit instruction to read deliverable content (it will be injected into prompt by harness — but instructions should still describe what to expect)
    2. Explicit instruction to write delivery results to `/tmp/summary.txt` (the OpenCode harness output contract)
  - **DozalDevs Summarizer** (archetype `00000000-0000-0000-0000-000000000012`, ~line 3240):
    - Current: `'Read the approved summary from the deliverable content. Post it to the publish channel...'`
    - New: `'You will receive the approved deliverable content below. Post the approved summary to the publish channel as a clean published message without buttons: NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$PUBLISH_CHANNEL" --text "<approved summary content>". Do not include approve/reject buttons. After delivery, write your results to /tmp/summary.txt as JSON with a "delivered" boolean field.'`
  - **VLRE Summarizer** (archetype `00000000-0000-0000-0000-000000000013`, ~line 3285):
    - Same pattern as DozalDevs Summarizer above
  - **VLRE Guest-Messaging** (archetype `00000000-0000-0000-0000-000000000015`, ~line 3342):
    - Current: `'Read the approved response from the deliverable content. The deliverable content is a JSON object with a draftResponse field...'`
    - New: `'You will receive the approved deliverable content below as JSON. Parse it to extract the leadUid, threadUid (if present), and draftResponse fields. Send the approved response to the guest via Hostfully: tsx /tools/hostfully/send-message.ts --lead-id "<leadUid>" --thread-id "<threadUid, if present>" --message "<draftResponse>". After delivery, write your results to /tmp/summary.txt as JSON with a "delivered" boolean and the send-message.ts output.'`
  - Run `pnpm prisma db seed` to apply changes to local DB

  **Must NOT do**:
  - Do NOT change `delivery_instructions` for `unresponded-message-monitor` (it's `null` — no delivery phase)
  - Do NOT change any other archetype fields (system_prompt, instructions, model, etc.)
  - Do NOT change the delivery_instructions' functional behavior — only add clarity about input format and output contract
  - Do NOT add complex logic to delivery_instructions — keep them as simple shell tool invocations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text updates in seed.ts (3 string replacements) + one CLI command
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `prisma/seed.ts:3240-3241` — DozalDevs Summarizer delivery_instructions (current value to replace)
  - `prisma/seed.ts:3285-3286` — VLRE Summarizer delivery_instructions (current value to replace)
  - `prisma/seed.ts:3342-3343` — VLRE Guest-Messaging delivery_instructions (current value to replace)
  - `prisma/seed.ts:3402` — Unresponded Monitor delivery_instructions: `null` (do NOT touch)

  **API/Type References**:
  - `src/workers/opencode-harness.mts:342-345` — Where `runOpencodeSession()` checks for `/tmp/summary.txt` content. If missing, throws "Model did not produce content". This is WHY delivery_instructions must include the write instruction.

  **WHY Each Reference Matters**:
  - Lines 3240, 3285, 3342 are the exact strings to replace. The update adds: (1) "You will receive the approved deliverable content below" (because the harness will inject it), (2) "write your results to /tmp/summary.txt" (output contract requirement).
  - Line 342-345 in harness explains the hard requirement for `/tmp/summary.txt`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 3 delivery_instructions contain /tmp/summary.txt instruction
    Tool: Bash
    Preconditions: seed.ts changes applied
    Steps:
      1. Run: grep -c "summary.txt" prisma/seed.ts
      2. Assert count is >= 3 (one per archetype)
      3. Run: grep -c "You will receive the approved deliverable content" prisma/seed.ts
      4. Assert count is >= 3
    Expected Result: All 3 approval-required archetypes have both the input format and output contract instructions
    Failure Indicators: Count less than 3 for either pattern
    Evidence: .sisyphus/evidence/task-3-seed-grep.txt

  Scenario: Seed applies successfully
    Tool: Bash
    Preconditions: seed.ts changes applied, database running
    Steps:
      1. Run: pnpm prisma db seed 2>&1 | tail -10
      2. Assert exit code is 0
      3. Verify no "error" in output
    Expected Result: Seed completes without errors
    Failure Indicators: Prisma error, constraint violation, connection refused
    Evidence: .sisyphus/evidence/task-3-seed-apply.txt

  Scenario: Unresponded monitor delivery_instructions unchanged (still null)
    Tool: Bash
    Preconditions: seed.ts changes applied
    Steps:
      1. Run: grep -A1 "00000000-0000-0000-0000-000000000016" prisma/seed.ts | grep "delivery_instructions"
      2. Assert line contains "null"
    Expected Result: Unresponded monitor archetype still has delivery_instructions: null
    Failure Indicators: Non-null value for this archetype
    Evidence: .sisyphus/evidence/task-3-monitor-unchanged.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-seed-grep.txt — grep counts for both patterns
  - [ ] task-3-seed-apply.txt — prisma db seed output
  - [ ] task-3-monitor-unchanged.txt — grep confirming null preserved

  **Commit**: YES
  - Message: `chore(seed): update delivery_instructions with output contract`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm prisma db seed`

- [x] 4. Replace runDeliveryPhase() with OpenCode session

  **What to do**:
  - In `src/workers/opencode-harness.mts`, replace the entire `runDeliveryPhase()` function (lines 350-471) and the delivery fork point (lines 496-500) with a proper OpenCode-based delivery session
  - **Step 1: Remove `runDeliveryPhase()` function** — Delete the entire function (lines 350-471)
  - **Step 2: Check and remove `execSync` import** — Use `lsp_find_references` or grep to verify `execSync` is not used anywhere else in the file. If it's only used in `runDeliveryPhase()`, remove the import (likely at line 6: `import { execSync } from 'node:child_process'`)
  - **Step 3: Replace the fork point** (lines 496-500) with the new delivery session logic:

    ```typescript
    const isDeliveryPhase = process.env.EMPLOYEE_PHASE === 'delivery';
    if (isDeliveryPhase) {
      // 1. Fetch the approved deliverable content from DB
      const deliverableRows = await db.get(
        'deliverables',
        `external_ref=eq.${TASK_ID}&select=*&order=created_at.desc&limit=1`,
      );
      const deliverable = deliverableRows?.[0] as Record<string, unknown> | undefined;
      if (!deliverable) {
        log.error({ taskId: TASK_ID }, 'No deliverable found for delivery phase');
        await markFailed('No deliverable found for delivery phase', null);
        return;
      }
      const deliverableContent = (deliverable.content as string) ?? '';

      // 2. Build delivery prompt with injected deliverable content
      const deliveryInstructions = archetype.delivery_instructions ?? '';
      const deliveryPrompt = `${deliveryInstructions}\n\n--- DELIVERABLE CONTENT ---\n${deliverableContent}\n--- END DELIVERABLE CONTENT ---\n\nTask ID: ${TASK_ID}`;

      // 3. Replicate auth/config setup from working phase
      //    (copy whatever setup exists between the fork point and runOpencodeSession() call in main)
      //    At minimum: writeOpencodeAuth() or env var setup for OpenRouter

      // 4. Run the OpenCode session
      const deliveryResult = await runOpencodeSession(
        archetype.system_prompt ?? '',
        deliveryPrompt,
        archetype.model ?? 'minimax/minimax-m2.7',
      );

      // 5. Mark task Done + log status transition
      await db.patch('tasks', `id=eq.${TASK_ID}`, {
        status: 'Done',
        updated_at: new Date().toISOString(),
      });
      await db.post('status_transitions', {
        task_id: TASK_ID,
        from_status: 'Delivering',
        to_status: 'Done',
        created_at: new Date().toISOString(),
      });
      log.info({ taskId: TASK_ID }, 'Delivery phase complete — task Done');
      return;
    }
    ```

  - **Step 4: Verify auth/config setup** — Read lines 514-584 of the working phase in `main()`. Identify any auth setup calls (like `writeOpencodeAuth()`, env var assignments for `OPENROUTER_MODEL`/`OPENCODE_PROVIDER_ID`, or config file writes) that happen BEFORE `runOpencodeSession()`. These same setup steps must be replicated in the delivery branch BEFORE calling `runOpencodeSession()`. Note: `runOpencodeSession()` internally sets `process.env.OPENROUTER_MODEL` and `process.env.OPENCODE_PROVIDER_ID` (lines 192-193), so those are handled. Focus on any FILE-BASED setup (auth.json, config files) that happens in main() before the call.
  - **Step 5: Do NOT resolve AGENTS.md for delivery** — The working phase calls `resolveAgentsMd()` to write a custom AGENTS.md. Skip this for delivery. The baked-in AGENTS.md from the Docker image is sufficient for simple delivery tasks.

  **Must NOT do**:
  - Do NOT change `runOpencodeSession()` function signature or internals
  - Do NOT add `FEEDBACK_CONTEXT` or `LEARNED_RULES_CONTEXT` to the delivery prompt
  - Do NOT resolve AGENTS.md in delivery phase (no `resolveAgentsMd()` call)
  - Do NOT change how the lifecycle dispatches delivery machines (that's Task 2's scope)
  - Do NOT fire `employee/task.completed` event after delivery (the lifecycle already handles state via the machine poll)
  - Do NOT change the working phase code path — only the delivery branch

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Architectural replacement requiring careful understanding of the harness internals, auth setup replication, and correct post-session lifecycle management
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/workers/opencode-harness.mts:163-348` — `runOpencodeSession()` function. This is what we're calling. Understand its signature, what it expects (systemPrompt, instructions, model), and what it returns `({ content, metadata })`.
  - `src/workers/opencode-harness.mts:502-584` — Working phase main() setup. Lines 502-514 build systemPrompt + instructions. Lines 514-563 contain any auth/config setup. Lines 563-578 resolve AGENTS.md (skip for delivery). Line 584 calls `runOpencodeSession()`. **READ LINES 514-563 CAREFULLY** — any file writes or env assignments there must be replicated in the delivery branch.
  - `src/workers/opencode-harness.mts:350-471` — Current `runDeliveryPhase()` to DELETE. Lines 454-470 show the post-delivery steps (patch Done, log status_transitions) that must be preserved in the new code.
  - `src/workers/opencode-harness.mts:496-500` — Current fork point to REPLACE.

  **API/Type References**:
  - `src/workers/opencode-harness.mts:479-494` — Where `archetype` is fetched from DB. The delivery branch uses `archetype.delivery_instructions`, `archetype.system_prompt`, `archetype.model`. Verify these fields are available on the fetched row.
  - `src/workers/lib/postgrest-client.ts` — The `db` object used for `db.get()`, `db.patch()`, `db.post()`. Same API as `runDeliveryPhase()` already uses.

  **WHY Each Reference Matters**:
  - Lines 163-348: Must understand `runOpencodeSession()` contract — especially that it reads `/tmp/summary.txt` internally and throws if missing (hence Task 3 updating delivery_instructions)
  - Lines 502-584: The MOST IMPORTANT reference — contains any auth setup steps that the delivery branch must replicate. Without these, OpenCode may fail to authenticate.
  - Lines 350-471: Shows the post-session steps (patch Done + log transition) that must be preserved
  - Lines 496-500: The exact code being replaced

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: runDeliveryPhase() function no longer exists
    Tool: Bash
    Preconditions: Task 4 changes applied
    Steps:
      1. Run: grep -n "runDeliveryPhase" src/workers/opencode-harness.mts
      2. Assert 0 matches (function completely removed)
    Expected Result: No references to runDeliveryPhase anywhere in the file
    Failure Indicators: Any match means the function or a call to it still exists
    Evidence: .sisyphus/evidence/task-4-no-run-delivery-phase.txt

  Scenario: execSync import removed (if no longer used)
    Tool: Bash
    Preconditions: Task 4 changes applied
    Steps:
      1. Run: grep -n "execSync" src/workers/opencode-harness.mts
      2. If 0 matches → PASS (removed correctly)
      3. If matches exist, verify they're NOT just an unused import (check if they're in functional code)
    Expected Result: 0 occurrences of execSync (import + usage both removed)
    Failure Indicators: Import remains but no usage (dead import → lint will catch)
    Evidence: .sisyphus/evidence/task-4-no-execsync.txt

  Scenario: Delivery branch calls runOpencodeSession
    Tool: Bash
    Preconditions: Task 4 changes applied
    Steps:
      1. Run: grep -A5 "EMPLOYEE_PHASE.*delivery" src/workers/opencode-harness.mts | grep "runOpencodeSession"
      2. Assert at least 1 match
    Expected Result: The delivery branch contains a call to runOpencodeSession
    Failure Indicators: 0 matches means the delivery still uses hardcoded logic
    Evidence: .sisyphus/evidence/task-4-uses-opencode-session.txt

  Scenario: Delivery branch patches task to Done (not Submitting)
    Tool: Bash
    Preconditions: Task 4 changes applied
    Steps:
      1. Run: grep -B2 -A2 "Delivering.*Done\|Done.*Delivering\|status: 'Done'" src/workers/opencode-harness.mts
      2. Verify at least one match within the delivery branch (should show status: 'Done' and from_status: 'Delivering')
    Expected Result: Post-session code patches task status to 'Done' and logs Delivering → Done transition
    Failure Indicators: No Done status patch, or patching to 'Submitting' instead
    Evidence: .sisyphus/evidence/task-4-patches-done.txt

  Scenario: Build compiles successfully
    Tool: Bash
    Preconditions: Task 4 changes applied
    Steps:
      1. Run: pnpm build 2>&1 | tail -10
      2. Assert exit code is 0
    Expected Result: TypeScript compiles with 0 errors
    Failure Indicators: Type errors, missing imports, undeclared variables
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: Lint passes (no dead imports)
    Tool: Bash
    Preconditions: Task 4 changes applied
    Steps:
      1. Run: pnpm lint 2>&1 | grep -i "error\|warning" | head -20
      2. Assert 0 errors (warnings acceptable)
    Expected Result: No lint errors (especially no unused-imports errors for execSync)
    Failure Indicators: Unused import error for execSync or child_process
    Evidence: .sisyphus/evidence/task-4-lint.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-no-run-delivery-phase.txt — grep confirming function removed
  - [ ] task-4-no-execsync.txt — grep confirming import removed
  - [ ] task-4-uses-opencode-session.txt — grep confirming new code calls runOpencodeSession
  - [ ] task-4-patches-done.txt — grep confirming Done status patch
  - [ ] task-4-build.txt — pnpm build output
  - [ ] task-4-lint.txt — pnpm lint output

  **Commit**: YES
  - Message: `feat(harness): replace hardcoded delivery with OpenCode session`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build && pnpm lint`

- [x] 5. Docker rebuild + seed apply + build verification

  **What to do**:
  - Rebuild the Docker image to pick up changes to `opencode-harness.mts` and `send-message.ts`: `docker build -t ai-employee-worker:latest .`
  - Apply the seed to update delivery_instructions in DB: `pnpm prisma db seed`
  - Verify the build: `pnpm build` (should have 0 errors)
  - Verify lint: `pnpm lint` (should have 0 errors)
  - Verify tests still pass: `pnpm test -- --run` (pre-existing failures are acceptable — see AGENTS.md Known Issues)

  **Must NOT do**:
  - Do NOT push the Docker image to any registry
  - Do NOT run `prisma migrate` (no schema changes — just seed data)
  - Do NOT fix pre-existing test failures (container-boot.test.ts, inngest-serve.test.ts, integration.test.ts)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running 4 CLI commands and checking output — no code changes
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References** (CRITICAL):

  **Pattern References**:
  - `AGENTS.md:§ "CRITICAL — Rebuild after every worker change"` — Explains why Docker rebuild is mandatory after harness/worker-tools changes
  - `AGENTS.md:§ "Pre-existing Test Failures"` — Lists 3 tests that always fail (do NOT attempt to fix)

  **WHY Each Reference Matters**:
  - Rebuild rule: Without Docker rebuild, the running container still has the old harness code
  - Pre-existing failures: Prevents the executor from getting stuck trying to fix unrelated test failures

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker build succeeds
    Tool: Bash (via tmux — long-running)
    Preconditions: All code changes from Tasks 1-4 committed
    Steps:
      1. Run: docker build -t ai-employee-worker:latest . 2>&1 | tail -5
      2. Assert output contains "Successfully built" or "exporting to image"
      3. Assert exit code is 0
    Expected Result: Docker image builds without errors
    Failure Indicators: Build failure, missing file COPY errors, TypeScript compile errors inside container
    Evidence: .sisyphus/evidence/task-5-docker-build.txt

  Scenario: Seed applies and DB has updated delivery_instructions
    Tool: Bash
    Preconditions: Database running, seed.ts updated (Task 3)
    Steps:
      1. Run: pnpm prisma db seed 2>&1 | tail -5
      2. Assert exit code is 0
      3. Run: curl -s "http://localhost:54321/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=delivery_instructions" -H "apikey: $SUPABASE_SECRET_KEY" | jq -r '.[0].delivery_instructions' | grep "summary.txt"
      4. Assert grep finds match (delivery_instructions includes output contract)
    Expected Result: Seed applied, DB has updated delivery_instructions with /tmp/summary.txt instruction
    Failure Indicators: Seed error, or grep finds no match in DB value
    Evidence: .sisyphus/evidence/task-5-seed-and-verify.txt

  Scenario: Build + lint + tests pass
    Tool: Bash
    Preconditions: All code changes applied
    Steps:
      1. Run: pnpm build 2>&1 | tail -3
      2. Assert exit code is 0
      3. Run: pnpm lint 2>&1 | tail -3
      4. Assert exit code is 0
      5. Run: pnpm test -- --run 2>&1 | tail -10
      6. Assert no NEW test failures (pre-existing ones are OK)
    Expected Result: All three pass (with known pre-existing test failures accepted)
    Failure Indicators: New TypeScript errors, new lint errors, new test failures
    Evidence: .sisyphus/evidence/task-5-build-lint-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-docker-build.txt — Docker build output (last 20 lines)
  - [ ] task-5-seed-and-verify.txt — Seed output + DB query result
  - [ ] task-5-build-lint-test.txt — Combined build/lint/test output

  **Commit**: NO (build/verification step — no code changes)

- [x] 6. Full E2E verification — trigger → approve → Done

  **What to do**:
  - Run a complete end-to-end test of the guest-messaging flow with `HOSTFULLY_MOCK=true`:
    1. Ensure `.env` has `HOSTFULLY_MOCK=true` set
    2. Ensure services are running (`pnpm dev:start` or `pnpm dev:local`)
    3. Trigger a guest-messaging webhook:
       ```bash
       curl -X POST http://localhost:7700/webhooks/hostfully \
         -H "Content-Type: application/json" \
         -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"e2e-delivery-test-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
       ```
    4. Wait for task to reach `Reviewing` status (poll via admin API)
    5. Approve via manual Inngest event (or press Slack button if connected):
       ```bash
       curl -X POST "http://localhost:8288/e/local" \
         -H "Content-Type: application/json" \
         -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U05V0CTJLF6","userName":"Victor"}}'
       ```
    6. Wait for task to reach `Done` status (poll — should take 2-5 minutes for delivery OpenCode session)
    7. Verify `status_transitions` record exists for `Delivering → Done`
    8. Verify no real Hostfully API was called (mock was active)

  **Must NOT do**:
  - Do NOT test with `HOSTFULLY_MOCK` unset (would hit real Hostfully API)
  - Do NOT use a `message_uid` that was already used (dedup will reject)
  - Do NOT modify any code — this is verification only
  - Do NOT attempt to fix failures by changing code in this task — report failures and let the orchestrator decide

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E testing requires patience (polling), tmux for long-running services, careful state management, and ability to diagnose failures from logs
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References** (CRITICAL):

  **Pattern References**:
  - `AGENTS.md:§ "Simulate a webhook locally"` — Exact curl command for triggering guest-messaging
  - `AGENTS.md:§ "Manual approval fallback"` — Curl command for approving via Inngest event
  - `AGENTS.md:§ "Admin API"` — How to check task status via admin endpoint
  - `AGENTS.md:§ "Long-Running Commands"` — MUST use tmux for dev:start and polling
  - `AGENTS.md:§ "Hostfully Testing"` — Test resource IDs (thread_uid, lead_uid, property_uid)

  **WHY Each Reference Matters**:
  - Webhook curl: Exact payload format with correct agency_uid for VLRE tenant
  - Approval curl: How to approve without relying on Slack button (deterministic testing)
  - Admin API: How to poll task status to confirm Done
  - Tmux: Services MUST run in tmux — gateway, Inngest dev server, Docker daemon

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E — webhook → working phase → Reviewing → approve → delivery → Done
    Tool: Bash (curl + polling)
    Preconditions: Services running (gateway, Inngest, Docker), HOSTFULLY_MOCK=true in .env, Docker image rebuilt (Task 5)
    Steps:
      1. Trigger webhook with unique message_uid (include timestamp for uniqueness)
      2. Poll task status every 15s for up to 5 minutes: expect progression through Executing → Reviewing
      3. Once Reviewing: send approval event via Inngest curl
      4. Poll task status every 15s for up to 5 minutes: expect Delivering → Done
      5. Query status_transitions: curl -s "http://localhost:54321/rest/v1/status_transitions?task_id=eq.$TASK_ID&to_status=eq.Done" -H "apikey: $SUPABASE_SECRET_KEY"
      6. Assert non-empty array (transition was logged)
    Expected Result: Task progresses through full lifecycle to Done, with Delivering → Done transition logged
    Failure Indicators: Task stuck in Executing (OpenCode failed), stuck in Delivering (delivery session failed), marked Failed (error occurred)
    Evidence: .sisyphus/evidence/task-6-e2e-full-flow.txt

  Scenario: Delivery used mock (not real API)
    Tool: Bash
    Preconditions: E2E test from scenario above completed successfully
    Steps:
      1. Check Docker container logs for the delivery machine: docker logs <container-name> 2>&1 | grep -i "mock\|fixture\|hostfully"
      2. Verify NO network errors to api.hostfully.com (would indicate real API call attempt)
      3. Alternatively: verify the task completed successfully despite having no real HOSTFULLY_API_KEY in the mock scenario
    Expected Result: Delivery completed using mock fixture, no real API interaction
    Failure Indicators: Errors mentioning api.hostfully.com connection, or HOSTFULLY_API_KEY missing errors
    Evidence: .sisyphus/evidence/task-6-mock-verification.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-e2e-full-flow.txt — Full polling log showing status progression webhook → Done
  - [ ] task-6-mock-verification.txt — Container logs confirming mock usage

  **Commit**: NO (verification step — no code changes)

- [x] 7. Create platform-level local E2E testing guide

  **What to do**:
  - Create `docs/2026-05-04-2023-local-e2e-testing.md` — a platform-level guide for future AI agents and developers
  - The guide should cover these sections:
    1. **Overview** — What "local E2E testing" means in this platform (fully-isolated, no real external APIs)
    2. **The `{SERVICE}_MOCK=true` Convention** — How mock mode works:
       - Env var naming: `{SERVICE}_MOCK=true` (e.g., `HOSTFULLY_MOCK=true`)
       - Set in `.env` — propagated to worker machines via `tenant-env-loader.ts` platform whitelist
       - Each mock-enabled shell tool checks its service mock env var at the top of `main()`
       - When active: reads fixture file from `fixtures/{tool-name}/default.json`, writes to stdout, returns early
       - When inactive: normal API call behavior
    3. **Fixture File Structure** — Where fixtures live and how to create them:
       - Location: `src/worker-tools/{service}/fixtures/{tool-name}/default.json`
       - Content: Must match the real tool's stdout success output shape exactly
       - Per-argument variants: Optional (e.g., `fixtures/get-messages/{leadId}.json`) with fallback to `default.json`
    4. **Env Propagation Path** — How mock vars reach the worker container:
       - `.env` → gateway process → `tenant-env-loader.ts` (platform whitelist) → machine env
       - For delivery machines: lifecycle explicitly passes mock vars to delivery container env
       - Diagram: `.env` → `PLATFORM_ENV_WHITELIST` → `loadTenantEnv()` → Docker/Fly.io machine env → shell tool `process.env`
    5. **What's Always Real** — Services that cannot/should not be mocked:
       - Slack (Socket Mode — local gateway connects directly)
       - Inngest (local dev server at localhost:8288)
       - Supabase/PostgreSQL (local Docker Compose)
       - OpenRouter/LLM (required for OpenCode sessions — uses real API key)
    6. **Running a Full Local E2E Test** — Step-by-step:
       - Prerequisites: `pnpm dev:start`, Docker image rebuilt, `.env` configured with mocks
       - Trigger: webhook curl command or admin API trigger endpoint
       - Monitor: poll task status via admin API
       - Approve: manual Inngest event or Slack button
       - Verify: check final status, status_transitions, container logs
    7. **Adding Mock Support to a New Shell Tool** — The pattern for future tools:
       - Add `{SERVICE}_MOCK` to `PLATFORM_ENV_WHITELIST` in `tenant-env-loader.ts`
       - Add the mock check block to the tool's `main()` (copy from any existing tool)
       - Create fixture file at `fixtures/{tool-name}/default.json`
       - If lifecycle passes env vars to delivery machines explicitly, add the mock var there too
       - Reference: `docs/2026-05-04-1645-adding-a-shell-tool.md` for the full shell tool checklist
    8. **Currently Mock-Enabled Tools** — Living list:
       - `src/worker-tools/hostfully/get-messages.ts` — `HOSTFULLY_MOCK=true`
       - `src/worker-tools/hostfully/get-reservations.ts` — `HOSTFULLY_MOCK=true`
       - `src/worker-tools/hostfully/get-property.ts` — `HOSTFULLY_MOCK=true`
       - `src/worker-tools/hostfully/send-message.ts` — `HOSTFULLY_MOCK=true`
  - Link to (do NOT duplicate): `docs/testing/guest-messaging/` for Hostfully-specific test scenarios
  - Link to: `docs/2026-05-04-1645-adding-a-shell-tool.md` for the full shell tool creation checklist

  **Must NOT do**:
  - Do NOT duplicate content from `docs/testing/guest-messaging/` scenario files
  - Do NOT make this Hostfully-specific — the guide is GENERIC for any employee/service
  - Do NOT modify any existing docs in `docs/testing/guest-messaging/`
  - Do NOT add mock implementation details for services that don't have mock support yet

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Pure documentation task — creating a well-structured technical guide
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after E2E verification confirms everything works)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References** (CRITICAL):

  **Pattern References** (docs to follow for style):
  - `docs/2026-05-04-1645-adding-a-shell-tool.md` — Reference doc style: practical, step-by-step, with code blocks. The testing guide should match this tone.
  - `docs/testing/guest-messaging/2026-05-03-1946-00-prerequisites-and-setup.md:1-50` — Format reference: Quick Reference table + numbered steps + bash blocks + Expected output. Use a similar structure.

  **API/Type References**:
  - `src/gateway/services/tenant-env-loader.ts:5-17` — `PLATFORM_ENV_WHITELIST` array to reference in the "Env Propagation" section
  - `src/worker-tools/hostfully/get-reservations.ts:73-84` — The canonical mock pattern code block to include in the guide

  **WHY Each Reference Matters**:
  - `adding-a-shell-tool.md` — Style guide for the doc. Match the same practical, no-fluff approach.
  - `00-prerequisites-and-setup.md` — Structure reference for the "Running a Full Local E2E" section.
  - `tenant-env-loader.ts` — Exact source of truth for which env vars propagate to workers.
  - `get-reservations.ts` — The mock pattern code block to include as the canonical example.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Guide file exists with correct name and structure
    Tool: Bash
    Preconditions: Task 7 completed
    Steps:
      1. Run: ls docs/2026-05-04-2023-local-e2e-testing.md
      2. Assert file exists
      3. Run: grep -c "^##" docs/2026-05-04-2023-local-e2e-testing.md
      4. Assert at least 7 H2 sections (one per section described above)
      5. Run: grep "HOSTFULLY_MOCK" docs/2026-05-04-2023-local-e2e-testing.md | wc -l
      6. Assert at least 3 occurrences (mentioned in multiple contexts)
    Expected Result: File exists with proper structure and comprehensive mock documentation
    Failure Indicators: File missing, fewer than 7 sections, no mention of HOSTFULLY_MOCK
    Evidence: .sisyphus/evidence/task-7-guide-structure.txt

  Scenario: Guide references related docs (not duplicating them)
    Tool: Bash
    Preconditions: Task 7 completed
    Steps:
      1. Run: grep "docs/testing/guest-messaging" docs/2026-05-04-2023-local-e2e-testing.md
      2. Assert at least 1 reference (link to scenario docs)
      3. Run: grep "adding-a-shell-tool" docs/2026-05-04-2023-local-e2e-testing.md
      4. Assert at least 1 reference (link to shell tool checklist)
    Expected Result: Guide links to related docs rather than duplicating their content
    Failure Indicators: No links to related docs (isolation), or entire sections copied from other docs
    Evidence: .sisyphus/evidence/task-7-cross-references.txt

  Scenario: Guide contains the canonical mock code block
    Tool: Bash
    Preconditions: Task 7 completed
    Steps:
      1. Run: grep "process.env\['.*_MOCK'\]" docs/2026-05-04-2023-local-e2e-testing.md
      2. Assert at least 1 match (the pattern is shown in the guide)
      3. Run: grep "fixtures.*default.json" docs/2026-05-04-2023-local-e2e-testing.md
      4. Assert at least 1 match (fixture path convention documented)
    Expected Result: Guide includes the actual mock code pattern and fixture convention
    Failure Indicators: Guide is too abstract (no code examples), or doesn't document the fixture path
    Evidence: .sisyphus/evidence/task-7-code-patterns.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-guide-structure.txt — Section count and HOSTFULLY_MOCK mention count
  - [ ] task-7-cross-references.txt — grep showing links to related docs
  - [ ] task-7-code-patterns.txt — grep showing code pattern presence

  **Commit**: YES
  - Message: `docs: add platform-level local E2E testing guide`
  - Files: `docs/2026-05-04-2023-local-e2e-testing.md`
  - Pre-commit: None (documentation only)

- [x] 8. Add AGENTS.md reference table row + Telegram notification

  **What to do**:
  - Add a new row to the Reference Documents table in `AGENTS.md` (after the last entry at line 616):
    ```
    | `docs/2026-05-04-2023-local-e2e-testing.md`            | Local E2E testing: mock convention, fixture structure, env propagation, how to add mocks to new tools/employees                                                                                            |
    ```
  - Also add a brief mention in the "Key Conventions" section or a new "Local Testing" subsection in AGENTS.md that tells agents: "For fully-isolated local E2E testing without real external APIs, set `{SERVICE}_MOCK=true` in `.env`. See Reference Documents for the full guide."
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ delivery-phase-and-local-testing complete — All tasks done. Come back to review results."`

  **Must NOT do**:
  - Do NOT add multiple rows to the Reference Documents table (only ONE for the new guide)
  - Do NOT add rows for `docs/testing/guest-messaging/` files (they're intentionally not in the table)
  - Do NOT restructure the existing AGENTS.md sections
  - Do NOT break the markdown table alignment

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: One table row addition + one brief mention + one telegram command
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References** (CRITICAL):

  **Pattern References**:
  - `AGENTS.md:601-616` — The Reference Documents table. New row goes after line 616 (last entry). Must match the table formatting: `| backtick-path | prose description |` with consistent pipe alignment.
  - `AGENTS.md:§ "Key Conventions"` — Existing conventions section where a brief local testing mention can be added.
  - `scripts/telegram-notify.ts` — Telegram notification script. Invoke via `tsx scripts/telegram-notify.ts "message"`.

  **WHY Each Reference Matters**:
  - Lines 601-616: Exact location and format for the new table row. Must maintain column alignment.
  - Key Conventions: Natural place to add a one-liner about mock testing for discoverability.
  - telegram-notify.ts: Required by plan rules (Prometheus planning § Telegram Notifications).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md has new reference table row
    Tool: Bash
    Preconditions: Task 8 changes applied
    Steps:
      1. Run: grep "local-e2e-testing" AGENTS.md
      2. Assert exactly 1 match
      3. Run: grep "local-e2e-testing" AGENTS.md | grep "|.*|.*|"
      4. Assert match has pipe-delimited table format
    Expected Result: One correctly-formatted table row referencing the new guide
    Failure Indicators: 0 matches (row missing), >1 match (duplicate), broken pipe syntax
    Evidence: .sisyphus/evidence/task-8-agents-md-row.txt

  Scenario: AGENTS.md mentions mock testing convention
    Tool: Bash
    Preconditions: Task 8 changes applied
    Steps:
      1. Run: grep -i "MOCK.*true\|mock convention\|local.*e2e\|isolated.*testing" AGENTS.md | head -5
      2. Assert at least 1 match outside the Reference Documents table (in conventions or a new subsection)
    Expected Result: Brief mention of mock testing exists for discoverability
    Failure Indicators: Mock testing only mentioned in the table row description (not discoverable by skimming)
    Evidence: .sisyphus/evidence/task-8-mock-mention.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: All prior tasks complete
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ delivery-phase-and-local-testing complete — All tasks done. Come back to review results."
      2. Assert exit code is 0
    Expected Result: Notification sent successfully
    Failure Indicators: Exit code non-zero, network error
    Evidence: .sisyphus/evidence/task-8-telegram.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-agents-md-row.txt — grep showing table row
  - [ ] task-8-mock-mention.txt — grep showing convention mention
  - [ ] task-8-telegram.txt — telegram script output

  **Commit**: YES
  - Message: `docs(agents): add local E2E testing guide reference`
  - Files: `AGENTS.md`
  - Pre-commit: None

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check for dead `execSync` import. Verify mock pattern matches existing tools exactly.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute full E2E from clean state: trigger guest-messaging webhook → wait for Reviewing → approve via curl → verify task reaches Done. Run `HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/send-message.ts --lead-id "test" --message "test"` directly. Verify mock works without API key. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Verify no changes to `docs/testing/guest-messaging/`, no changes to `runOpencodeSession()` internals, no FEEDBACK_CONTEXT in delivery.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                    | Files                                                                                                         |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | `feat(hostfully): add HOSTFULLY_MOCK support to send-message.ts`  | `src/worker-tools/hostfully/send-message.ts`, `src/worker-tools/hostfully/fixtures/send-message/default.json` |
| 2    | `fix(lifecycle): pass HOSTFULLY_MOCK to delivery machine env`     | `src/inngest/employee-lifecycle.ts`                                                                           |
| 3    | `chore(seed): update delivery_instructions with output contract`  | `prisma/seed.ts`                                                                                              |
| 4    | `feat(harness): replace hardcoded delivery with OpenCode session` | `src/workers/opencode-harness.mts`                                                                            |
| 5    | No commit (build/verify step)                                     | —                                                                                                             |
| 6    | No commit (E2E verification step)                                 | —                                                                                                             |
| 7    | `docs: add platform-level local E2E testing guide`                | `docs/2026-05-04-2023-local-e2e-testing.md`                                                                   |
| 8    | `docs(agents): add local E2E testing guide reference`             | `AGENTS.md`                                                                                                   |

---

## Success Criteria

### Verification Commands

```bash
# Mock works without API key
unset HOSTFULLY_API_KEY && HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/send-message.ts --lead-id "test-lead" --message "hello" | jq .sent
# Expected: true

# Build passes
pnpm build
# Expected: 0 errors

# Lint passes
pnpm lint
# Expected: 0 errors

# E2E: task reaches Done after approval
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" -H "X-Admin-Key: $ADMIN_API_KEY" | jq .status
# Expected: "Done"

# AGENTS.md has reference
grep "local-e2e-testing" AGENTS.md
# Expected: 1 match with pipe-delimited table row
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build + lint pass
- [ ] E2E delivery works with HOSTFULLY_MOCK=true
- [ ] Documentation complete with AGENTS.md reference
