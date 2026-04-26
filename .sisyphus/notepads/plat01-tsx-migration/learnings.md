# Learnings — plat01-tsx-migration

## [2026-04-22] Story Map AC Cleanup

- PLAT-01 ACs (lines 275-281 in `docs/2026-04-21-2202-phase1-story-map.md`) toggled from `[ ]` to `[x]`
- 3 stale `npx tsx` references fixed: lines 278, 279, 280 now correctly say `tsx` (global Docker context)
- Line 276 intentionally kept as `npx tsx src/worker-tools/...` — test invocations use npx (local dev), not Docker global
- Distinction: `npx tsx` = local dev/tests; `tsx` = Docker container (globally installed)

## [2026-04-23] Session: ses_24ccbd834ffeYGSKUEgEVAv8UH — Plan Start

### Key Technical Facts

- `tsx` is already in devDependencies (`"tsx": "^4.0.0"`) — no package.json changes needed
- Docker builder stage has BOTH `src/` AND `dist/` available (line 11: `COPY src/ ./src/`)
- Slack tools import `@slack/web-api` — npm install at `/tools/slack/` must be kept
- Hostfully tools have ZERO npm imports — only Node built-ins + native fetch
- 5 test files (all hostfully) — no Slack test files exist
- Tests use Variant A (args+env): get-messages, get-reservations, get-properties, get-property
- Tests use Variant B (env-only): validate-env — no `args` param in runScript
- `NODE_NO_WARNINGS=1` works identically with tsx (it's a Node.js env var)
- In Docker: use `tsx` directly (globally installed) — NOT `npx tsx`
- In tests: use `npx tsx` (uses local devDep, no global install required)

### Scope Boundaries

- IN SCOPE: Dockerfile, 5 test files, prisma/seed.ts, AGENTS.md, story map doc
- OUT OF SCOPE: gateway, inngest, harness, tsconfig.build.json, new test files

### Seed Reference

- DOZALDEVS_SUMMARIZER_INSTRUCTIONS: prisma/seed.ts lines 159-172 (3 node invocations)
- VLRE_SUMMARIZER_INSTRUCTIONS: prisma/seed.ts lines 174-187 (3 node invocations)
- Total: 6 replacements across 2 archetypes

### Approved Models

- All production code: `minimax/minimax-m2.7`
- Verification/judge only: `anthropic/claude-haiku-4-5`
- FORBIDDEN: `anthropic/claude-sonnet-*`, any other model

## [2026-04-22] Task 2: Test file migration (node → npx tsx)

### Changes Made

- All 5 hostfully test files updated: SCRIPT_PATH → `src/worker-tools/hostfully/*.ts`
- All 5 execFile calls updated: `('node', [SCRIPT_PATH, ...])` → `('npx', ['tsx', SCRIPT_PATH, ...])`
- validate-env (Variant B): `execFile('node', [SCRIPT_PATH], ...)` → `execFile('npx', ['tsx', SCRIPT_PATH], ...)` — NO args spread

### Verification

- 44/44 tests pass (5 test files, 0 failures)
- No `dist/worker-tools` refs remain in tests/worker-tools/
- Commit: `test(worker-tools): migrate test execution from node to tsx`

### Pattern Notes

- Multi-line path.resolve (get-reservations, get-properties): only the last string arg needs changing
- Single-line path.resolve (get-messages, get-property): full line replacement
- validate-env has inline execFile (not multi-line) — different edit target than Variant A
- `npx tsx` works in test context because tsx is in devDependencies

## [2026-04-22] Task 1: Dockerfile tsx migration

### Changes Made

- Added `RUN npm install -g tsx` after opencode-ai install (line 49)
- Changed all 7 COPY lines from `dist/worker-tools/.../*.js` → `src/worker-tools/.../*.ts`
- Kept `RUN npm install --prefix /tools/slack @slack/web-api@^7.15.1` unchanged

### Verification Results

- Docker build: EXIT_CODE:0 (tsx install took ~85s due to npm network)
- tsx version in container: tsx v4.21.0, node v20.20.2
- Hostfully smoke test (get-messages.ts --help): EXIT:0, shows usage
- Slack smoke test (post-message.ts --help): EXIT:0, shows usage
- File listing: only .ts files in /tools/slack/ and /tools/hostfully/ (no .js)

### Key Observations

- `.sisyphus/evidence/` is gitignored — evidence files saved locally but not committed
- Builder stage has `src/` available (line 11: `COPY src/ ./src/`) — confirmed .ts source files accessible
- tsx global install adds ~5 packages, takes ~85s in Docker build
- Both slack and hostfully tools work correctly with tsx execution

## [2026-04-22] Task 3: prisma/seed.ts archetype instruction migration

### Changes Made

- DOZALDEVS_SUMMARIZER_INSTRUCTIONS (lines 159-172): 3 replacements
  - read-channels.js → read-channels.ts, node → tsx
  - post-message.js (approval) → post-message.ts, node → tsx (NODE_NO_WARNINGS=1 prefix preserved)
  - post-message.js (delivery) → post-message.ts, node → tsx
- VLRE_SUMMARIZER_INSTRUCTIONS (lines 174-187): 3 replacements (same pattern)

### Verification

- `grep -n "node /tools/" prisma/seed.ts` → 0 matches
- `grep -c "tsx /tools/" prisma/seed.ts` → 6
- `pnpm prisma db seed` → exit 0, all archetypes upserted successfully
- Commit: `chore(seed): update archetype instructions to use tsx for tool execution`

### Key Observations

- `.sisyphus/evidence/` is gitignored — evidence files saved locally but not committed to git
- Each archetype has exactly 3 tool invocations: read-channels, post-message (approval), post-message (delivery)
- `NODE_NO_WARNINGS=1` prefix on post-message approval invocations preserved exactly as-is
- Channel IDs unchanged: C092BJ04HUG, C0AUBMXKVNU (DozalDevs); C0AMGJQN05S, C0ANH9J91NC, C0960S2Q8RL (VLRE)

## [2026-04-22] Task 4: Documentation migration (AGENTS.md + story map)

### Changes Made

- AGENTS.md lines 62, 64: `node /tools/slack/*.js` → `tsx /tools/slack/*.ts` (2 changes)
- Story map Shell Tool Convention (lines 33-41): Rewrote section — removed "Compiled" bullet, changed Docker path from .js to .ts, updated description to tsx execution model
- Story map: 9 total `node /tools/` occurrences updated to `tsx /tools/` with .ts extensions:
  - Line 41 (convention explanation)
  - Lines 204, 226, 248 (hostfully HF-02/03/04 ACs — already [x] checked)
  - Lines 321, 370, 393, 462, 1099 (platform/hostfully/kb future ACs)

### Verification

- `grep -n "node /tools/" AGENTS.md` → 0 matches
- `grep -n "node /tools/" docs/2026-04-21-2202-phase1-story-map.md` → 0 matches
- Commit: `docs: update tool invocation references from node to tsx`

### Key Observations

- `.sisyphus/evidence/` is gitignored — evidence files saved locally but not committed
- Checkbox states ([x] / [ ]) were NOT changed — only tool invocation syntax within AC text
- Story map line numbers shifted slightly from task context due to prior edits (grep confirmed actual positions)
- AGENTS.md is loaded into every LLM call — stale tool syntax would cause runtime failures for AI employees
