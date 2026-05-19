# Learnings — post-message-auto-context

## [2026-05-19] Session Start

### Architecture Decisions

- Auto env-var approach chosen: post-message.ts reads NOTIFY_MSG_TS + INNGEST_RUN_ID from env automatically
- No --run-id CLI flag — env-var-only to eliminate LLM forget-failure-mode
- --no-thread flag added to opt out of auto-threading
- Precedence: --no-thread > explicit --thread-ts > NOTIFY_MSG_TS env > no threading

### Key Line Numbers (pre-change)

- employee-lifecycle.ts:518 — NOTIFY_MSG_TS in localWorkerEnv
- employee-lifecycle.ts:550 — NOTIFY_MSG_TS in flyWorkerEnv
- employee-lifecycle.ts:526 — extra array for localWorkerEnv PLATFORM_ENV_MANIFEST
- employee-lifecycle.ts:558 — extra array for flyWorkerEnv PLATFORM_ENV_MANIFEST
- post-message.ts:41-42 — existing --thread-ts flag parsing
- post-message.ts:63-104 — buildApprovalBlocks() — context block at lines 80-83
- post-message.ts:149 — no-approval context block
- post-message.ts:151 — buildApprovalBlocks call site

### Critical Edge Cases

- NOTIFY_MSG_TS='' (empty string) must be treated as unset — use truthy check `if (envTs)` not `=== undefined`
- buildApprovalBlocks is exported and used in 3 test files — must use optional runId?: string param
- Two context blocks: approval path (line 82) AND no-approval path (line 149) — BOTH must be updated
- INNGEST_RUN_ID must be added to PLATFORM_ENV_MANIFEST extra array or LLM won't know it exists

### Previous Plan Context

- threading-newlines-observability plan already: added runId to lifecycle (line 132), stored in metadata, added to buildNotifyBlocks/buildNotifyStateBlocks
- runId is destructured at lifecycle line 132 — available in scope for T1
