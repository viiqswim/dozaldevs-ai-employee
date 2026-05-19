# Learnings

## 2026-05-19 Session Start

### Key File Locations

- `src/workers/lib/output-schema.mts` — 36 lines, StandardOutput interface + Zod schema + isApprovalRequired()
- `src/worker-tools/slack/post-message.ts` — 159 lines, parseArgs() + buildApprovalBlocks() + main()
- `src/inngest/employee-lifecycle.ts` — large file; approvalRequired extracted at line ~158; execution env at ~505-570; delivery env at ~1867-1906
- `src/workers/opencode-harness.mts` — tryAutoPostApprovalCard() calls at ~382-389 and ~496-504
- `AGENTS.md` — Current Implementation table at lines 39-47 (to be stripped)
- `prisma/seed.ts` — ~4000 lines; CODE_ROTATION_AGENTS_MD near top; code-rotation archetype at 3344-3388
- `src/workers/lib/agents-md-resolver.mts` — 38 lines; resolveAgentsMd() takes 6 params

### Codebase Conventions

- Two env injection paths: local Docker + Fly.io — BOTH must be updated for every env var addition
- `APPROVAL_REQUIRED` env var format: `'true'`/`'false'` strings (String(boolean))
- Worker tool CLI pattern: `args[i] === '--flag' && args[i + 1]` then `args[++i]`
- Do NOT touch `post-guest-approval.ts` — it already has --thread-ts support

### Pre-existing Issues

- Two `it.skip` tests in `tests/inngest/lifecycle-notify-msg-ts.test.ts` — must fix, not leave skipped
- TypeScript LSP shows pre-existing errors in `archetype-repository.ts` and `admin-archetypes.ts` re: `deleted_at` — these are pre-existing, NOT caused by our work

### Architecture Notes

- AGENTS.md is baked into Docker image at /app/AGENTS.md — rebuild required after changes
- agents-md-resolver.mts concatenates: Platform Policy → Platform Runtime Context → Tenant Conventions → Employee Instructions → Behavioral Rules → Employee Knowledge
- The daily-motivation-quote archetype (27f590a5-...) was created via dashboard, not seed.ts — its agents_md must be updated via psql
