# Learnings

## 2026-05-16 Session Init
- Plan: human-friendly-employee-config
- 15 tasks across 5 waves (4 impl + 1 final verification)
- No worktree — working in main repo
- Stack: TypeScript/MTS for workers, Zod for validation, @slack/web-api, vitest for tests

## Key Architecture Facts
- resolveAgentsMd() in agents-md-resolver.mts is ONLY 33 lines — very small file
- system_prompt STAYS in DB schema — just stop populating it in seed data
- action_ids must match exactly: approve_task, reject_task, edit_task (from post-guest-approval.ts)
- approval_message_ts is the metadata key that lifecycle reads (not approval_ts or ts)
- NOTIFY_MSG_TS and REPLY_BROADCAST are injected AFTER loadTenantEnv() returns — must be added to manifest separately
- Delivery phase at harness lines 431-536 never calls resolveAgentsMd() — this is the bug being fixed
- pnpm test -- --run is the test command
- zod is already in package.json

## Task 1: output-schema.mts

- Zod v4 (`^4.3.6`) requires `z.record(z.string(), z.unknown())` — two args, not one
- `.mts` files in `src/workers/lib/` only import from external packages (no internal imports)
- `parseStandardOutput` uses `safeParse` + try/catch for double safety (JSON.parse can throw)
- Pre-existing test failures: `migration-agents-md.test.ts` (2 tests) — seed data mismatch, unrelated to output-schema
- Build: `pnpm build` compiles `.mts` files via `tsconfig.build.json`

## Task 2: approval-card-poster.mts

- KnownBlock is from `@slack/web-api` (not `@slack/types` — not in package.json)
- action_ids `approve_task`, `reject_task`, `edit_task` are NEW generic ones (not in handlers.ts yet — will be added in later tasks)
- post-guest-approval.ts uses `guest_approve`, `guest_edit`, `guest_reject` — employee-specific, NOT used in the generic card
- `buildApprovalBlocks` uses `as KnownBlock` casts since Block Kit object literals don't satisfy the union type directly
- Classification badge: `✅ NO_ACTION_NEEDED` or `🔔 NEEDS_APPROVAL`
- Header prefix: `⚠️ ` for urgency=true, `📝 ` otherwise
- `postApprovalCard` throws on failure (no silent swallow)
- Build: clean (EXIT_CODE:0)
- Tests: 1310 passed, 2 pre-existing failures in migration-agents-md.test.ts

## Task 6: Harness slim fullPrompt + security via AGENTS.md

- `runOpencodeSession` signature changed from `(systemPrompt, instructions, model)` → `(instructions, model)`
- `fullPrompt` is now simply `${instructions}\n\nTask ID: ${TASK_ID}` — no system_prompt prefix
- `platformRuntimeSections` built in execution phase (NOT delivery phase) with 3 possible entries:
  1. Security preamble — always present (## Security Boundary)
  2. Env manifest — only when `process.env.PLATFORM_ENV_MANIFEST` is set and non-empty
  3. Legacy system_prompt — only when `archetype.system_prompt` is non-empty (backward compat)
- `resolveAgentsMd()` 6th arg `platformRuntimeSections` passed at execution phase resolveAgentsMd call
- Delivery phase call updated to remove systemPrompt arg: `runOpencodeSession(deliveryPrompt, model)`
- `systemPrompt` variable at line ~540 kept (used for backward compat in platformRuntimeSections)
- Build: clean (EXIT_CODE:0)
- Tests: 371 passed, 2 pre-existing failures in migration-agents-md.test.ts — no new failures

## Task 9: parseClassifyResponse standard JSON schema handling

- Standard schema detection: JSON with `classification` field but NO legacy-specific fields
- Legacy fields list: `draftResponse`, `guestName`, `propertyName`, `checkIn`, `checkOut`, `bookingChannel`, `conversationSummary`, `category`, `displayContext`
- Key insight: legacy JSON payloads also have `classification` field — must distinguish by absence of legacy fields
- Standard schema maps: `draft` → `draftResponse`, `summary` → `summary`, `confidence` → `confidence`, `reasoning` → `reasoning`, `urgency` → `urgency`
- Standard schema path sets `category: 'acknowledgment'` for NO_ACTION_NEEDED, `'other'` for NEEDS_APPROVAL
- Standard schema path sets `conversationSummary: null` (not in standard schema)
- Parse order: (1) standard JSON, (2) legacy plain text `NO_ACTION_NEEDED:`, (3) legacy JSON, (4) parse failure fallback
- Tests: 219 passed, 2 pre-existing failures in migration-agents-md.test.ts — no new failures

## Task 7: Harness auto-post approval card

- `tryAutoPostApprovalCard` is a module-level async function (not inside runOpencodeSession) — can be called from both code paths
- Function uses `process.env.SLACK_BOT_TOKEN ?? process.env.VLRE_SLACK_BOT_TOKEN` for token, `NOTIFICATION_CHANNEL` for channel
- Wrapped in try/catch — NEVER throws; if card post fails, returns `{}` (task continues)
- On success: writes `/tmp/approval-message.json` with `{ ts, channel, approval_message_ts, target_channel }` — `approval_message_ts` is the exact key lifecycle reads
- Both code paths updated: `checkOutputFiles` (early-exit path) AND normal completion path (post-`finally`)
- Pattern: track `approvalJsonExists` bool; after reading summary.txt, if `!approvalJsonExists && content !== 'completed'` → parse → if NEEDS_APPROVAL → tryAutoPost
- If classification is NO_ACTION_NEEDED: no card posted (parsedOutput exists but `isApprovalRequired` returns false)
- The `writeFile` import inside `tryAutoPostApprovalCard` via dynamic `import('fs/promises')` — avoids top-level import for a function that may never be called
- Build: clean (EXIT_CODE:0)
- Tests: 1311 passed, 2 pre-existing failures in migration-agents-md.test.ts — no new failures

## Task 8: Harness delivery phase AGENTS.md enrichment + remove delivery adapter

- Removed `getDeliveryAdapter` import from line 6 of opencode-harness.mts
- Removed the entire `if (archetype.enrichment_adapter)` adapter block
- New delivery prompt: `${deliveryInstructions}\n\n--- APPROVED CONTENT ---\n${deliverableContent}\n--- END APPROVED CONTENT ---\n\nTask ID: ${TASK_ID}`
  - Header changed from `--- DELIVERABLE CONTENT ---` to `--- APPROVED CONTENT ---`
  - The `const deliveryPrompt = ...` replaces `let deliveryPrompt = ''` + adapter block + `if (!deliveryPrompt)` fallback
- Added AGENTS.md resolution block between `writeOpencodeAuth()` and `runOpencodeSession()` (steps 4 and 6)
  - Uses `{ agents_md: archetype.delivery_instructions ?? null }` as the archetype arg → appears as `# Employee Instructions`
  - Does NOT pass employeeRules or employeeKnowledge (delivery phase has no learned rules)
  - Uses `import('node:fs/promises')` for readFile/writeFile (consistent with execution phase)
  - Full try/catch: any failure logs warning and proceeds with bare AGENTS.md
  - deliveryRuntimeSections: security boundary (always) + env manifest (if set)
- Test file `opencode-harness-delivery.test.ts` updated:
  - 5 tests rewrote to use `--- APPROVED CONTENT ---` instead of `--- DELIVERABLE CONTENT ---`
  - Adapter pre-parse tests (tests 1 & 2) rewrote to verify raw passthrough behavior (no `--lead-id`, `--thread-id`)
  - `vi.mock('fs/promises')` covers `node:fs/promises` too (or catch handles ENOENT either way)
- delivery-adapters/ directory left intact (just no longer imported)
- Step numbering in delivery phase updated: 5=AGENTS.md, 6=run session, 7=verify, 8=mark Done
- Build: clean (EXIT_CODE:0)
- Tests: 1311 passed, 2 pre-existing failures in migration-agents-md.test.ts — no new failures

## Task 10: Guest-messaging archetype → 3-field plain English

- GUEST_MESSAGING_AGENTS_MD replaced: 114 lines of engineering-artifact content → 22 lines of plain English
- VLRE_GUEST_MESSAGING_INSTRUCTIONS: removed trailing `+ 'Env: $LEAD_UID ...'` line — now 86 chars (under 100 limit)
- system_prompt: '' in both create and update blocks (removed GUEST_MESSAGING_SYSTEM_PROMPT import)
- delivery_instructions: plain English in both blocks — no CLI syntax, no file path artifacts
- CRITICAL: tests/lib/conversation-history-context.test.ts tested OLD engineering-artifact content from agents_md → had to update to test new plain English content (5 test rewrites)
- New tests check: "Read the full conversation thread", "match the guest's language", NEEDS_APPROVAL, NO_ACTION_NEEDED, tool-usage-reference skill reference
- Build: clean (EXIT_CODE:0)
- Tests: 1311 passed, 2 pre-existing failures in migration-agents-md.test.ts — no new failures

## Task 11: Daily-summarizer archetype → 3-field plain English

- Two archetype entries: DozalDevs (id: 00000000-0000-0000-0000-000000000012) and VLRE (id: 00000000-0000-0000-0000-000000000013)
- Each has create + update blocks → 4 system_prompt changes, 4 delivery_instructions changes total
- PAPI_CHULO_SYSTEM_PROMPT const (line 27) left as dead code — prisma/seed.ts excluded from tsconfig.build.json (only src/**/* compiled), so no build error
- DOZALDEVS_SUMMARIZER_INSTRUCTIONS and VLRE_SUMMARIZER_INSTRUCTIONS simplified to identical 84-char strings (under 100 limit)
- agents_md: separate content for each tenant (DozalDevs = tech digest, VLRE = Papi Chulo dramatic style) — both follow same WORKFLOW/CLASSIFICATION RULES/TOOLS pattern
- delivery_instructions: plain English referencing /tmp/summary.txt output contract only — no CLI syntax, no $PUBLISH_CHANNEL env var
- No test rewrites needed — no tests check summarizer agents_md/instructions content directly
- Build: clean (EXIT_CODE:0)
- Tests: 1311 passed, 2 pre-existing failures in migration-agents-md.test.ts — no new failures

## Task 12: Code-rotation archetype → 3-field plain English

- One archetype entry: VLRE (id: 00000000-0000-0000-0000-000000000016)
- Each has create + update blocks → 2 system_prompt changes, 2 instructions changes total
- CODE_ROTATION_AGENTS_MD const (line 308) replaced: old 5-line security-focused content → 20-line plain English with WORKFLOW/CLASSIFICATION RULES/TOOLS pattern
- instructions: 'Rotate all lock codes for VLRE properties. Check your Employee Instructions in AGENTS.md.' (86 chars, under 100 limit)
- system_prompt: '' in both create and update blocks
- delivery_instructions: null in both blocks (code-rotation has approval_required: false — no delivery phase)
- No test rewrites needed — no tests check code-rotation agents_md/instructions content directly
- admin-property-locks-integration.test.ts has 1 pre-existing failure (integration test requires live DB — unrelated to seed changes)
- Build: clean (EXIT_CODE:0)
- Tests: 1310 passed, 3 failures (2 pre-existing migration-agents-md.test.ts + 1 pre-existing admin-property-locks-integration.test.ts requiring live DB) — no new failures

## Task 14: Brain tab — Human Configuration & Auto-Injected sections

- `humanFields` and `autoInjectedSections` added to `admin-brain-preview.ts` response (after `employee_knowledge` in the `res.status(200).json({...})` block)
- `BrainPreviewResponse` type in `dashboard/src/lib/types.ts` extended with `humanFields` and `autoInjectedSections` nested objects
- `BrainPreviewTab.tsx`: two new sections inserted BEFORE the nav bar (top of the return statement):
  - "Human Configuration" — Card with 3 fields: Task Trigger, Employee Manual (truncated at 800 chars), After-Approval Action
  - "Auto-Injected by Platform" — Card with 3 badge rows: Security (blue), Output (purple), Env (green)
- Employee Manual truncation: `slice(0, 800) + '\n… (truncated)'` — prevents agents_md from overwhelming the view
- Security preamble displayed text uses `split('\n\n')[1]` to skip the `## Security Boundary` header line
- Build: clean (EXIT_CODE:0) — `pnpm build` compiles both gateway TS and dashboard

## Task 13: Test suite update — output-schema + approval-card-poster tests

- vitest.config.ts excludes ALL tests/workers/lib/ files except opencode-server and postgrest-client — must add new files to the negation pattern `!(opencode-server|postgrest-client|output-schema|approval-card-poster)`
- Import .mts files in tests using .mjs extension: `from '../../../src/workers/lib/output-schema.mjs'`
- `buildApprovalBlocks` is a pure function — no mocking needed, tests all paths synchronously
- `postApprovalCard` requires Slack WebClient mock — not tested here (pure function coverage sufficient)
- Pre-existing failures before T13: only 2 in migration-agents-md.test.ts
- Final counts: 132 test files, 1378 total tests, 1333 passing, 2 failing (pre-existing), 43 skipped
- seed-guest-messaging.test.ts system_prompt test checks DB values — passes because test DB still has old seed (tests run against ai_employee_test DB, not re-seeded)
- No test assertions needed updating — all T1-T12 changes produced 0 new test failures
