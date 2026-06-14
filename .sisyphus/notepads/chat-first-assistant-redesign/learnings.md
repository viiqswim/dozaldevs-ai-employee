# Learnings — chat-first-assistant-redesign

## [2026-06-14] Session Start

### Codebase State (verified)

- `src/gateway/routes/admin-archetype-interpret-request.ts` EXISTS — to be deleted in T6
- `src/gateway/routes/admin-archetype-propose-edit.ts` EXISTS — to be unified in T5
- `dashboard/src/panels/employees/AssistantTab.tsx` EXISTS — to be rebuilt in T9
- `dashboard/src/panels/employees/sections/` — contains ProposalDiffCard.tsx, EditHistoryList.tsx
- `dashboard/src/panels/employees/__tests__/` — test directory exists

### Key Conventions

- All gateway responses use `sendError`/`sendSuccess` from `src/gateway/lib/http-response.ts`
- Auth: `requireTenantRole(TenantRole.ADMIN)` for propose-edit
- Dashboard uses `gatewayFetch` wrapper in `dashboard/src/lib/gateway.ts`
- `CollapsibleSection` exists in dashboard for collapsible UI
- `useUnsavedChangesGuard` hook exists in dashboard
- `react-diff-viewer-continued` already installed
- `sonner` for toasts in dashboard
- Card shells: `rounded-lg border bg-card` with `px-5 py-4` padding

### Critical Invariants (MUST preserve)

1. Hard allowlist: `identity, execution_steps, delivery_steps, overview, risk_model.approval_required, tool_registry.tools, trigger_sources, input_schema`
2. Strictly disallowed: `model, temperature, role_name, vm_size, concurrency_limit`
3. Approval-off safeguard: warning + explicit confirm checkbox when `approval_required` goes true→false
4. Prose-blank guard: 422 if non-empty prose field is blanked
5. Tool validation: only tools in `ALL_TOOL_DESCRIPTORS` + tenant Composio toolkits
6. Trigger/input Zod validation

### Architecture Decisions

- Server stays STATELESS — transcript is client-held, no DB table
- `kind: 'question' | 'proposal' | 'no_change' | 'too_long'` discriminated union
- Branch on `kind` BEFORE `postProcess()`/`applyModelAndEstimate()` and BEFORE `proseUnchanged` nudge
- 5-question backstop → forced best-guess proposal
- Token-budget guard → `{kind:'too_long'}` signal
- Re-fetch baseline at Approve (silent last-write-wins)
- ONE input box only — no second textarea anywhere

## [2026-06-14] T1 Complete — archetype-edit-helpers extraction

### What was extracted

- `mapArchetypeRowToConfig` — was duplicated in `admin-archetype-propose-edit.ts` and `admin-archetype-interpret-request.ts`. Now lives only in `src/gateway/lib/archetype-edit-helpers.ts`.
- `validateProposalFields` — was inline in `admin-archetype-propose-edit.ts`. Extracted to the same helper module.
- `StrippedProposal` interface and `ValidateProposalResult` type also exported from the helper.

### Gotcha: trigger_sources undefined comparison

`validateProposalFields` compares `proposal.trigger_sources` vs `baseline.trigger_sources` via `JSON.stringify`. When `proposal.trigger_sources` is `undefined`, `JSON.stringify(undefined)` returns the JS value `undefined` (not the string `"undefined"`), so the comparison `undefined !== '{"type":"manual"}'` is `true`, triggering Zod validation of `undefined` which fails.

In production this is fine because `applyAllowlist(rawProposal)` always populates `trigger_sources` from the LLM output. In tests, always include `trigger_sources` in proposals to match production behavior.

### Test location

`tests/unit/gateway/lib/archetype-edit-helpers.test.ts` — 16 tests covering both helpers.

### Commit

`6b31226a` — `refactor(archetypes): extract shared archetype-edit map + validation helpers`

## [2026-06-14] T3 Complete — converse() clarify-then-act engine branch

### What was added

- `CONVERSE_SYSTEM_PROMPT_PRE` / `CONVERSE_SYSTEM_PROMPT_POST` — clearance-style prompts in `archetype-generator-prompts.ts`
- `buildConverseSystemPrompt()` — local function in `archetype-generator.ts`, mirrors `buildRefineSystemPrompt()` pattern with connectedAppsBlock + tool catalog
- `CONVERSE_TOKEN_BUDGET = 60_000` — module-level constant
- `ArchetypeGenerator.converse()` — new method with:
  - Token-budget guard (returns `{kind:'too_long'}` without LLM call)
  - 5-question backstop (injects "do not ask" directive in user message; coerces model's question response to no_change)
  - LLM call via `callLLMWithJsonRetry` (temp: 0.3, maxTokens: 16000, responseFormat: json_object)
  - Branching BEFORE postProcess/applyModelAndEstimate on question/no_change
  - postProcess + applyModelAndEstimate called only on proposal path
  - changed_fields diff computed for prose + risk_model.approval_required
  - tool_delta, trigger_change, input_change, approval_warning computed and included if present

### Key Patterns

- `postProcess` is not exported — cannot directly spy on it in tests. Verified indirectly:
  - question path: estimator LLM calls = 0
  - proposal path: estimator LLM calls > 0 (applyModelAndEstimate fires TimeEstimator)
- Routing mock: checks `messages[0].content.startsWith('You estimate manual task duration')` to intercept estimator calls
- ConverseMessage and ConverseResult types were already defined in archetype-generator.ts (T2 had run)

### Test file

`tests/unit/gateway/services/archetype-generator-converse.test.ts` — 4 tests, all passing

### Commit

`1ad58177` — `feat(archetypes): add converse() clarify-then-act engine branch`

## [2026-06-14] T4 Complete — ProposalDiffCard secondary refine UI removed

### What was removed
- `onRefineSubmit?: (text: string) => void` prop from `ProposalDiffCardProps`
- `showRefine` and `refineText` state variables
- Refine textarea JSX block (was L182-209)
- "Ask for more changes" button (was L218-222)
- `handleRefine` async function from `AssistantTab.tsx`
- `onRefineSubmit` prop pass-through in `AssistantTab.tsx`

### What was preserved
- Approval-off safeguard: amber warning + confirm checkbox when `approvalChange.to === false`
- `approveDisabled = busy || (requiresApprovalConfirm && !approvalConfirmed)`
- Approve and Deny buttons
- All diff viewer rendering (prose, tools, trigger, input, approval sections)

### Test suite state before T4
- Tests in AssistantTab.test.tsx were ALL FAILING before T4 (except 2)
- Root cause: AssistantTab was already refactored to a 2-step interpretRequest→confirm→proposeEdit flow (prior task), but tests still mocked only proposeEdit and used the old 1-step flow
- `interpretRequest` was missing from the gateway mock → TypeError "not a function" → all catch blocks hit → PROPOSAL_ERROR_FALLBACK shown instead of expected content

### Test suite fixes
- Added `interpretRequest: vi.fn()` to gateway mock
- Extracted `submitAndConfirm()` helper: type→Send→waitFor(Confirm)→click(Confirm)
- Updated all 8 tests to use the 2-step flow
- Replaced "refine produces a new proposal card" with 2 new tests:
  - "proposal card has no refine textarea and no 'Ask for more changes' button" 
  - "proposal card approval-off confirm gates Approve button"
- Updated "approve" test: `handleApprove` no longer calls `recordEditHistory` (removed in prior task)
- Updated "error" test: plain `Error` goes to `PROPOSAL_ERROR_FALLBACK`, not "I wasn't able to..."
- Added `await waitFor(() => expect(approve).not.toBeDisabled())` before clicking Approve (timing: isLoading may still be true when 'Proposed changes' first renders)

### Critical note for future tasks
- `recordEditHistory` is NOT called in `handleApprove` — the history recording was removed or moved
- The "I wasn't able to make that change" error text only appears for gateway 422 errors with `{reasons: {...}}` body format

### Commit
`refactor(dashboard): remove ProposalDiffCard secondary input, keep approval gate`
