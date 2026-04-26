# Learnings — plat-02-static-agents-md

## [2026-04-23] Session Start

### Critical Facts

- OpenCode starts with `cwd: '/app'` (harness line 158) — auto-reads AGENTS.md from `/app/AGENTS.md`
- Source file: `src/workers/config/agents.md` (lowercase) → Docker destination: `/app/AGENTS.md` (uppercase)
- `.dockerignore` has `*.md` at root — adding `!src/workers/config/agents.md` defensive exception
- `agents-md-reader.ts` is for deprecated engineering worker — DO NOT MODIFY
- `report-issue` tool doesn't exist yet (PLAT-03 scope) — reference as `tsx /tools/platform/report-issue.ts`
- 6 policy points: (1) source access, (2) patch permission, (3) smoke test, (4) mandatory reporting, (5) platform off-limits, (6) DB via tools only
- Platform code off-limits: `/app/dist/`, `/app/node_modules/`, harness
- Patchable paths: only `/tools/` directory
- DB tool paths: `/tools/slack/`, `/tools/hostfully/`, `/tools/platform/`
- Do NOT create `/tools/platform/` directory — that's PLAT-03 scope

## Task 1 — agents.md creation (2026-04-22)

- File written to `src/workers/config/agents.md` (83 lines, prose only)
- OpenCode reads AGENTS.md from `/app` because harness sets `cwd: '/app'` (line 158 of opencode-harness.mts)
- `opencode.json` in same directory only has `{"permission": {"*": "allow", "question": "deny"}}` — no overlap with agents.md content
- All 6 policy sections verified present: /tools/ access, patch permission, --help smoke test, report-issue, /app/dist/ off-limits, no direct DB access
- No runtime values (localhost, UUIDs, channel IDs) in the file — confirmed clean
- Evidence saved to `.sisyphus/evidence/task-1-agents-md-content.txt` and `task-1-no-runtime-values.txt`
- `/tools/platform/report-issue.ts` referenced as forward-compatible path (PLAT-03 scope, doesn't exist yet)

## T2: Dockerfile + .dockerignore edits (complete)
- Dockerfile line 58: `COPY src/workers/config/agents.md /app/AGENTS.md` inserted after opencode.json COPY (final stage, line 57)
- .dockerignore line 14: `!src/workers/config/agents.md` appended at bottom — defensive exception to `*.md` pattern on line 11
- Source lowercase `agents.md` → destination uppercase `AGENTS.md` intentional (OpenCode on Linux expects uppercase)
- Evidence saved to `.sisyphus/evidence/task-2-*.txt`

## T3: Test file creation (complete)

- File: `tests/workers/config/agents-md-content.test.ts`
- 11 `it()` blocks: file exists, >20 lines, 6 policy assertions, 3 no-runtime-values checks
- Path resolution: `path.resolve(__dirname, '../../../src/workers/config/agents.md')` — correct from `tests/workers/config/`
- All 11 tests pass in 3ms (targeted run via `npx vitest run`)
- No mocking, no new dependencies, pure `fs.readFileSync` + Vitest assertions
- Evidence: `.sisyphus/evidence/task-3-vitest-results.txt`
