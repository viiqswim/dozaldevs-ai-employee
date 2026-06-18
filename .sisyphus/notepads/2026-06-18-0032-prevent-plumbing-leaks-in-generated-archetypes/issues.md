# Issues

## [2026-06-18] Known Issues / Gotchas

- `pnpm test` stays in WATCH mode — always use `pnpm test:unit` for one-shot runs
- Never use `--no-verify` on commits
- Never add Co-authored-by or AI references to commit messages
- `src/worker-tools/lib/output-contract-paths.generated.ts` has `// @generated` header — never hand-edit
- `overview` is a structured object (role, trigger, workflow[], tools_used, output, approval) — judge must traverse sub-fields including workflow array
- `{{key}}` placeholders (e.g. `{{target_date}}`) and `INPUT_*` tokens are NOT plumbing — judge must NOT flag them
- Legitimate business codes (e.g. `CONTRACT2024`) are NOT plumbing
- Plain words like "Slack" or "channel" are NOT plumbing — only raw channel IDs like `C0B71QSMZKQ` are
