# Learnings — submit-output-tool

## 2026-05-20 Init
- Canonical pattern: src/worker-tools/platform/report-issue.ts
  - parseArgs loop (not yargs/commander), --help to stdout via process.stdout.write(), errors via process.stderr.write(), main().catch() top-level
- Platform AGENTS.md injection confirmed working: Dockerfile COPY → resolveAgentsMd() concatenation
- Tool output path: /tmp/summary.txt only. NEVER /tmp/approval-message.json
- No env vars required — pure local file writer
- real-estate-motivation-bot is DB-only (not in prisma/seed.ts)
- Task 436a96cd failed because harness threw at line 521-525: content==='completed' && extraMetadata empty

## 2026-05-19 Task-1 Execution
- submit-output.ts created at src/worker-tools/platform/submit-output.ts
- tsx not on PATH in zsh — use `npx tsx` for local testing
- output-schema.mts allows APPROVED too, but tool restricts to NEEDS_APPROVAL | NO_ACTION_NEEDED per decisions.md
- All 4 QA scenarios passed: help(exit:0), missing-classification(exit:1), invalid-classification(exit:1), happy-path(exit:0+PASS)
- Evidence saved to .sisyphus/evidence/task-1-*.txt
- Committed: c531ce1 feat(platform): add submit-output tool for output contract
