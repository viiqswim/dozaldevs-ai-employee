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
