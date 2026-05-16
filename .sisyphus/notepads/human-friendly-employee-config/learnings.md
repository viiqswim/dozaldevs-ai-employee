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
