# Issues — cleaning-schedule-employee

## [2026-05-29] Known Gotchas

- Notion blocks API requires recursion for nested content (property details under zone headings)
- Hostfully `--from`/`--to` filters CHECK-IN date only — checkout filtering MUST be client-side
- Notion content is ALL IN SPANISH — execution_steps must explicitly instruct LLM to parse Spanish
- Notion page picker during OAuth: user must MANUALLY select both cleaning pages — cannot be pre-selected
- Pre-commit hooks run on every commit — `pnpm test -- --run` must pass before each commit
- LSP `import.meta` errors in worker tools are PRE-EXISTING and harmless (tools run via bun/tsx, not compiled to CommonJS)
