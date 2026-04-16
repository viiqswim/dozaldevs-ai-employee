# Issues — manual-employee-trigger-api

## [2026-04-16] Pre-existing LSP Errors (NOT our concern)

The following LSP errors exist in the codebase BEFORE our work begins. Do NOT fix them — they are pre-existing on other branches:

- `src/inngest/redispatch.ts:21` — implicit `any` on `event`/`step` bindings
- `src/inngest/lifecycle.ts:23` — same
- `src/inngest/employee-lifecycle.ts:16` — same
- `prisma/seed.ts:92,127,161` — `system_prompt`/`model` field mismatches (summarizer-mvp branch artifact)
- `tests/inngest/lifecycle.test.ts:3` — `InngestTestEngine`/`mockCtx` not exported from `@inngest/test`

**These must be ignored.** Our lsp_diagnostics verification should only check NEW files we create.

## [2026-04-16] Migration Command Note

`pnpm prisma migrate dev` is interactive but `--name` flag makes it non-interactive for the migration name prompt. DB must be running (Docker Compose) before T1 can execute.
