# Decisions — Third Maintainability Pass

## [2026-06-08] Session Start

- sendSuccess() = pass-through ONLY (no envelope wrapping)
- No new index.ts barrels
- catch handlers and as unknown as = document-only (no code change)
- server.ts startup reads = out of scope (preserves startup-failure ordering)
- Dashboard parity = Playwright over CDP (real Chrome), NOT unit tests
- Magic numbers = naming only, zero value change
